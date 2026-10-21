-- Accounts are required to use the app, and restaurants must be verified before they can post.
--
-- Verification is a manual review: a restaurant submits its license or permit number, phone,
-- website and a photo or PDF of the document. An admin approves or rejects it (with a reason)
-- from the app's review page. Submitted details are private to the restaurant and admins.

begin;

-- Admins

alter table profiles add column is_admin boolean not null default false;

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- Verification status lives on the venue (visible to signed-in users); details are private.

alter table venues add column verification_status text not null default 'pending'
  check (verification_status in ('pending', 'submitted', 'verified', 'rejected'));

-- Sample venues are treated as verified.
update venues set verification_status = 'verified' where owner_id is null;

create table venue_verifications (
  venue_id text primary key references venues (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  license_number text not null check (char_length(license_number) between 3 and 60),
  phone text not null check (char_length(phone) between 7 and 30),
  website text not null default '' check (char_length(website) <= 200),
  document_path text not null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  review_note text not null default ''
);

alter table venue_verifications enable row level security;
create policy "Owners and admins see verification details" on venue_verifications
  for select to authenticated using (owner_id = auth.uid() or is_admin());

-- Signed-in users only. Listings from unverified venues are hidden from everyone but their owner.

drop policy "Venues are public" on venues;
drop policy "Listings are public" on listings;

create policy "Signed-in users see venues" on venues
  for select to authenticated using (true);

create policy "Signed-in users see listings from verified venues" on listings
  for select to authenticated using (
    exists (
      select 1 from venues v
      where v.id = listings.venue_id
        and (v.verification_status = 'verified' or v.owner_id = auth.uid())
    )
  );

create policy "Admins see all profiles" on profiles
  for select to authenticated using (is_admin());

-- Document uploads: a private bucket; each restaurant writes only inside its own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-docs', 'verification-docs', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
);

create policy "Restaurants upload their own documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owners and admins read documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'verification-docs' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

-- Restaurant: submit or resubmit proof.

create function submit_verification(
  p_license_number text,
  p_phone text,
  p_website text,
  p_document_path text
) returns venue_verifications
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  v venues;
  r venue_verifications;
begin
  select * into v from venues where owner_id = uid for update;
  if not found then raise exception 'Only restaurant accounts can be verified'; end if;
  if v.verification_status = 'verified' then raise exception 'Your business is already verified'; end if;
  if split_part(coalesce(p_document_path, ''), '/', 1) <> uid::text then
    raise exception 'Upload your document first';
  end if;

  insert into venue_verifications (venue_id, owner_id, license_number, phone, website, document_path)
  values (v.id, uid, trim(p_license_number), trim(p_phone), trim(coalesce(p_website, '')), p_document_path)
  on conflict (venue_id) do update set
    license_number = excluded.license_number,
    phone = excluded.phone,
    website = excluded.website,
    document_path = excluded.document_path,
    submitted_at = now(),
    reviewed_at = null,
    reviewed_by = null,
    review_note = ''
  returning * into r;

  update venues set verification_status = 'submitted' where id = v.id;
  return r;
end $$;

-- Admin: everything waiting for review (or already reviewed), newest first.

create function list_verifications()
returns table (
  venue_id text,
  venue_name text,
  venue_kind text,
  venue_address text,
  venue_neighborhood text,
  status text,
  owner_name text,
  owner_email text,
  license_number text,
  phone text,
  website text,
  document_path text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  return query
    select v.id, v.name, v.kind, v.address, v.neighborhood, v.verification_status,
           p.display_name, u.email::text,
           r.license_number, r.phone, r.website, r.document_path, r.submitted_at, r.reviewed_at, r.review_note
    from venues v
    join profiles p on p.id = v.owner_id
    join auth.users u on u.id = v.owner_id
    left join venue_verifications r on r.venue_id = v.id
    order by (v.verification_status = 'submitted') desc, r.submitted_at desc nulls last;
end $$;

create function review_venue(p_venue text, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if not p_approve and char_length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Say why it was rejected so the restaurant can fix it';
  end if;
  update venue_verifications
  set reviewed_at = now(), reviewed_by = auth.uid(), review_note = trim(coalesce(p_note, ''))
  where venue_id = p_venue;
  if not found then raise exception 'Nothing submitted for this business yet'; end if;
  update venues set verification_status = case when p_approve then 'verified' else 'rejected' end
  where id = p_venue;
end $$;

-- Posting requires a verified venue. (So listings only ever exist for verified venues, and the
-- visitor actions need no extra check.)

create or replace function post_listing(
  p_title text,
  p_description text,
  p_category text,
  p_dietary text[],
  p_allergens text[],
  p_portions int,
  p_available_from timestamptz,
  p_available_until timestamptz,
  p_pickup_note text,
  p_reservable boolean
) returns listings
language plpgsql security definer set search_path = public as $$
declare
  v venues;
  l listings;
begin
  perform require_user();
  select * into v from venues where owner_id = auth.uid();
  if not found then raise exception 'Only restaurant accounts can post food'; end if;
  if v.verification_status <> 'verified' then
    raise exception 'Your business has to be verified before you can post';
  end if;
  if p_available_from < now() - interval '5 minutes' or p_available_until > now() + interval '1 day' then
    raise exception 'Pickup window is out of range';
  end if;
  if char_length(trim(coalesce(p_pickup_note, ''))) = 0 then raise exception 'Pickup note is required'; end if;

  insert into listings (venue_id, title, description, category, dietary, allergens, portions_total, portions_left,
                        available_from, available_until, pickup_note, reservable)
  values (v.id, trim(p_title), trim(coalesce(p_description, '')), p_category,
          coalesce(p_dietary, '{}'), coalesce(p_allergens, '{}'), p_portions, p_portions,
          p_available_from, p_available_until, trim(p_pickup_note), coalesce(p_reservable, true))
  returning * into l;
  return l;
end $$;

-- Permissions

revoke execute on all functions in schema public from public, anon, authenticated;
-- is_admin() is used inside row-level policies, which run as the signed-in user.
grant execute on function reserve, cancel_hold, take_portions, undo_pickup,
  post_listing, extend_listing, mark_gone, refresh_demo,
  submit_verification, list_verifications, review_venue, is_admin to authenticated;

commit;

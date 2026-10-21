-- Real accounts: visitors and restaurants sign up with email and password.
--
-- Anyone can browse listings without an account. Reserving, reporting a pickup and posting
-- food need a signed-in, non-anonymous user. Each restaurant account owns one venue, created
-- from the details given at sign-up, and can only post to and edit that venue.

begin;

-- Profiles

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('visitor', 'restaurant')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "See your own profile" on profiles for select to authenticated using (id = auth.uid());

-- Venues get an owner. The sample venues have none.

alter table venues alter column id set default gen_random_uuid()::text;
alter table venues add column owner_id uuid unique references auth.users (id) on delete cascade;
alter table venues add constraint venues_name_len check (char_length(name) between 1 and 80);
alter table venues add constraint venues_lat check (lat between -90 and 90);
alter table venues add constraint venues_lng check (lng between -180 and 180);

-- Sign-up details arrive as user metadata; turn them into a profile (and a venue for restaurants).
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := coalesce(m ->> 'role', 'visitor');
begin
  if new.is_anonymous then
    return new;
  end if;

  insert into profiles (id, role, display_name)
  values (new.id, r, coalesce(nullif(trim(m ->> 'display_name'), ''), split_part(new.email, '@', 1)));

  if r = 'restaurant' then
    insert into venues (name, kind, address, neighborhood, lat, lng, owner_id)
    values (
      trim(m ->> 'venue_name'),
      coalesce(nullif(trim(m ->> 'venue_kind'), ''), 'Restaurant'),
      trim(m ->> 'venue_address'),
      coalesce(trim(m ->> 'venue_neighborhood'), ''),
      (m ->> 'venue_lat')::double precision,
      (m ->> 'venue_lng')::double precision,
      new.id
    );
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helpers

create or replace function require_user() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Log in first';
  end if;
  return auth.uid();
end $$;

create function my_venue_id() returns text
language sql stable security definer set search_path = public as $$
  select id from venues where owner_id = auth.uid()
$$;

-- Restaurant actions now work on the signed-in restaurant's own venue.

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
  v text;
  l listings;
begin
  perform require_user();
  v := my_venue_id();
  if v is null then raise exception 'Only restaurant accounts can post food'; end if;
  if p_available_from < now() - interval '5 minutes' or p_available_until > now() + interval '1 day' then
    raise exception 'Pickup window is out of range';
  end if;
  if char_length(trim(coalesce(p_pickup_note, ''))) = 0 then raise exception 'Pickup note is required'; end if;

  insert into listings (venue_id, title, description, category, dietary, allergens, portions_total, portions_left,
                        available_from, available_until, pickup_note, reservable)
  values (v, trim(p_title), trim(coalesce(p_description, '')), p_category,
          coalesce(p_dietary, '{}'), coalesce(p_allergens, '{}'), p_portions, p_portions,
          p_available_from, p_available_until, trim(p_pickup_note), coalesce(p_reservable, true))
  returning * into l;
  return l;
end $$;

create or replace function extend_listing(p_listing text, p_minutes int) returns listings
language plpgsql security definer set search_path = public as $$
declare
  l listings;
begin
  perform require_user();
  if p_minutes not between 1 and 240 then raise exception 'Minutes out of range'; end if;
  update listings set available_until = available_until + make_interval(mins => p_minutes)
  where id = p_listing and venue_id = my_venue_id() and not marked_gone
  returning * into l;
  if not found then raise exception 'Listing not found'; end if;
  return l;
end $$;

create or replace function mark_gone(p_listing text) returns listings
language plpgsql security definer set search_path = public as $$
declare
  l listings;
begin
  perform require_user();
  update listings set marked_gone = true
  where id = p_listing and venue_id = my_venue_id()
  returning * into l;
  if not found then raise exception 'Listing not found'; end if;
  return l;
end $$;

drop function demo_partner_id();

-- Anonymous visitors are gone. Give back what they were holding or had taken, then remove them.

update listings l
set portions_left = least(l.portions_total, l.portions_left + x.n)
from (
  select listing_id, sum(n)::int as n
  from (
    select p.listing_id, p.portions as n
    from pickups p join auth.users u on u.id = p.user_id
    where u.is_anonymous
    union all
    select h.listing_id, 1
    from holds h join auth.users u on u.id = h.user_id
    where u.is_anonymous
  ) s
  group by listing_id
) x
where l.id = x.listing_id;

delete from auth.users where is_anonymous;

-- Permissions

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function reserve, cancel_hold, take_portions, undo_pickup,
  post_listing, extend_listing, mark_gone to authenticated;
-- Browsing without an account still keeps the sample data fresh.
grant execute on function refresh_demo to anon, authenticated;

commit;

-- New restaurants appear on everyone's map without a reload.
alter publication supabase_realtime add table venues;

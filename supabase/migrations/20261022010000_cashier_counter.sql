-- Counter mode: staff at the register tap once for every meal they hand over, so the count
-- stays right without asking the person picking up to do anything.
--
-- Each tap is a single UPDATE with the "still some left" check in its WHERE clause. Postgres
-- re-checks that clause after waiting on the row lock, so two registers (or a register and a
-- visitor reporting a pickup) tapping at once can never push the count below zero.
--
-- A listing that reaches 0 already counts as ended everywhere in the app, so nothing else needs
-- flipping here, and undoing the last tap brings it straight back.

begin;

create function decrement_portion(p_listing text) returns listings
language plpgsql security definer set search_path = public as $$
declare
  l listings;
begin
  perform require_user();
  update listings set portions_left = portions_left - 1
  where id = p_listing and venue_id = my_venue_id() and not marked_gone and portions_left > 0
  returning * into l;
  if not found then
    if not exists (select 1 from listings where id = p_listing and venue_id = my_venue_id()) then
      raise exception 'Listing not found';
    end if;
    raise exception 'None left';
  end if;
  return l;
end $$;

create function undo_decrement_portion(p_listing text) returns listings
language plpgsql security definer set search_path = public as $$
declare
  l listings;
begin
  perform require_user();
  update listings set portions_left = portions_left + 1
  where id = p_listing and venue_id = my_venue_id() and not marked_gone and portions_left < portions_total
  returning * into l;
  if not found then raise exception 'Nothing to undo'; end if;
  return l;
end $$;

-- Permissions

revoke execute on all functions in schema public from public, anon, authenticated;
-- is_admin() is used inside row-level policies, which run as the signed-in user.
grant execute on function take_portions, undo_pickup,
  post_listing, extend_listing, mark_gone, decrement_portion, undo_decrement_portion, refresh_demo,
  submit_verification, list_verifications, review_venue, is_admin to authenticated;

commit;

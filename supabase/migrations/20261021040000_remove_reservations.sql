-- Reservations are gone: pickup is first come, first served. People still say how much they
-- took, which is what keeps the count right.

begin;

-- Every hold had set one portion aside. Give them back before dropping the table.
update listings l
set portions_left = least(l.portions_total, l.portions_left + h.n)
from (select listing_id, count(*)::int as n from holds group by listing_id) h
where l.id = h.listing_id;

drop function reserve(text);
drop function cancel_hold(text);

create or replace function take_portions(p_listing text, p_portions int) returns pickups
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  l listings;
  taken int;
  p pickups;
begin
  if p_portions is null or p_portions < 1 then raise exception 'Portions must be at least 1'; end if;
  select * into l from listings where id = p_listing for update;
  if not found then raise exception 'Listing not found'; end if;
  if l.marked_gone or now() < l.available_from or now() >= l.available_until then
    raise exception 'This listing is not open right now';
  end if;
  if exists (select 1 from pickups where listing_id = p_listing and user_id = uid) then
    raise exception 'You already reported a pickup here';
  end if;

  taken := least(p_portions, l.portions_left);
  if taken < 1 then raise exception 'None left'; end if;

  update listings set portions_left = portions_left - taken where id = p_listing;
  insert into pickups (listing_id, user_id, portions) values (p_listing, uid, taken) returning * into p;
  return p;
end $$;

drop function release_expired_holds(text);
drop table holds;

-- post_listing loses its p_reservable argument, so it's dropped and recreated.
drop function post_listing(text, text, text, text[], text[], int, timestamptz, timestamptz, text, boolean);
alter table listings drop column reservable;

create function post_listing(
  p_title text,
  p_description text,
  p_category text,
  p_dietary text[],
  p_allergens text[],
  p_portions int,
  p_available_from timestamptz,
  p_available_until timestamptz,
  p_pickup_note text
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
                        available_from, available_until, pickup_note)
  values (v.id, trim(p_title), trim(coalesce(p_description, '')), p_category,
          coalesce(p_dietary, '{}'), coalesce(p_allergens, '{}'), p_portions, p_portions,
          p_available_from, p_available_until, trim(p_pickup_note))
  returning * into l;
  return l;
end $$;

-- Same Edison sample data as before, without the reservable flag.
create or replace function refresh_demo() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz := date_trunc('minute', now());
begin
  perform 1 from demo_meta where seeded_at is null or seeded_at < now() - interval '6 hours' for update;
  if not found then return false; end if;

  delete from listings where id in ('l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10', 'l11', 'l12', 'l13', 'h1', 'h2', 'h3');
  insert into listings (id, venue_id, title, description, category, dietary, allergens,
                        portions_total, portions_left, posted_at, available_from, available_until,
                        pickup_note, marked_gone)
  values
      ('l1', 'v1', 'Milk bread loaves and red bean buns', 'Today''s bake that didn''t sell. About 8 milk bread loaves plus a tray of red bean and custard buns.', 'bakery', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs']::text[],
       18, 11, t + interval '-40 minutes', t + interval '-40 minutes', t + interval '75 minutes',
       'Blue bin on the bench outside the front door. Please take two items max so more people get some.', false),
      ('l2', 'v2', 'Vegetarian thali boxes', 'Dal, rice, two sabzis and rotli, packed into single-serving containers with lids.', 'meals', array['vegetarian']::text[], array['gluten', 'dairy']::text[],
       25, 16, t + interval '-15 minutes', t + interval '-15 minutes', t + interval '45 minutes',
       'Ask at the register and say you saw it on Rescue Meal.', false),
      ('l3', 'v3', 'Apples, bananas and salad greens', 'Bruised or a little soft, but fine to eat. Greens are bagged. Bring a bag if you can.', 'produce', array['vegan', 'gluten-free']::text[], '{}'::text[],
       40, 30, t + interval '-90 minutes', t + interval '-90 minutes', t + interval '180 minutes',
       'Green crates by the side entrance off Plainfield Ave.', false),
      ('l4', 'v4', 'Turkey and veggie wraps, chicken soup', 'Made this afternoon. Wraps are wrapped individually, soup is in sealed quart containers. Veggie wraps have a green sticker.', 'meals', '{}'::text[], array['gluten', 'dairy']::text[],
       14, 4, t + interval '-20 minutes', t + interval '-20 minutes', t + interval '22 minutes',
       'Counter pickup. Staff will hand them over.', false),
      ('l5', 'v5', 'Pre-packed sandwiches and grain salads', 'Turkey, ham and veggie sandwiches. Farro and quinoa salads. All dated today.', 'meals', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs']::text[],
       20, 12, t + interval '-5 minutes', t + interval '-5 minutes', t + interval '115 minutes',
       'Fridge by the front window, top two shelves.', false),
      ('l6', 'v6', 'Take-home pho kits', 'Beef broth, rice noodles, herbs and bean sprouts packed separately. Heat the broth for 5 minutes.', 'meals', array['gluten-free']::text[], array['fish', 'soy']::text[],
       10, 10, t + interval '-10 minutes', t + interval '50 minutes', t + interval '140 minutes',
       'Side door by the parking lot after the dinner rush. Knock twice.', false),
      ('l7', 'v7', 'Boxes of mithai: ladoo, barfi and jalebi', 'Assorted sweets from today''s counter, boxed by the half pound. Some barfi has pistachio and cashew.', 'bakery', array['vegetarian']::text[], array['gluten', 'dairy', 'nuts']::text[],
       15, 9, t + interval '-60 minutes', t + interval '-60 minutes', t + interval '18 minutes',
       'Front counter. Ask anyone working.', false),
      ('l8', 'v8', 'Whole pies: cheese and veggie', 'Six large pies from a cancelled order. Boxed and still warm.', 'meals', array['vegetarian']::text[], array['gluten', 'dairy']::text[],
       6, 5, t + interval '-10 minutes', t + interval '-10 minutes', t + interval '95 minutes',
       'Front counter. One pie per person.', false),
      ('l9', 'v9', 'Yogurt, milk and cheese near sell-by', 'Sell-by is tomorrow. Everything has been kept refrigerated.', 'grocery', array['vegetarian', 'gluten-free']::text[], array['dairy']::text[],
       30, 22, t + interval '-120 minutes', t + interval '-120 minutes', t + interval '240 minutes',
       'Community fridge next to the entrance. Labeled "Free".', false),
      ('l10', 'v10', 'Frozen dumplings, pork and chive or veggie', 'Bags of 20, frozen today. Keep frozen until you cook them.', 'grocery', array['vegetarian']::text[], array['gluten', 'soy', 'sesame']::text[],
       24, 18, t + interval '-30 minutes', t + interval '-30 minutes', t + interval '150 minutes',
       'Ask at the takeout window.', false),
      ('l11', 'v11', 'Day-old bagels, mixed', 'Plain, sesame, everything and poppy. Great toasted.', 'bakery', array['vegan']::text[], array['gluten', 'sesame']::text[],
       60, 41, t + interval '-45 minutes', t + interval '-45 minutes', t + interval '60 minutes',
       'Paper bags on the rack by the door. Take a bag.', false),
      ('l12', 'v12', 'Event leftovers: baked ziti, salad, garlic knots', 'From a lunch event today. Packed into family-size trays, each feeds about 3.', 'meals', array['vegetarian']::text[], array['gluten', 'dairy']::text[],
       40, 33, t + interval '-10 minutes', t + interval '-10 minutes', t + interval '105 minutes',
       'Loading door at the back of the building. Ring the bell.', false),
      ('l13', 'v13', 'Chicken over rice platters', 'Chicken, yellow rice and salad with white sauce on the side. Halal certified.', 'meals', array['halal', 'gluten-free']::text[], array['dairy', 'eggs']::text[],
       12, 7, t + interval '-25 minutes', t + interval '-25 minutes', t + interval '55 minutes',
       'Front counter. Mention Rescue Meal.', false),
      ('h1', 'v1', 'Croissants and danishes', '', 'bakery', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs']::text[],
       24, 0, t + interval '-1560 minutes', t + interval '-1560 minutes', t + interval '-1440 minutes',
       'Blue bin outside the front door.', true),
      ('h2', 'v1', 'Seeded rye and baguettes', '', 'bakery', array['vegan']::text[], array['gluten', 'sesame']::text[],
       16, 3, t + interval '-3000 minutes', t + interval '-3000 minutes', t + interval '-2880 minutes',
       'Blue bin outside the front door.', false),
      ('h3', 'v1', 'Cookies and brownies', '', 'bakery', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs', 'nuts']::text[],
       30, 0, t + interval '-4440 minutes', t + interval '-4440 minutes', t + interval '-4320 minutes',
       'Counter.', true);

  update demo_meta set seeded_at = now();
  return true;
end $$;

-- Permissions

revoke execute on all functions in schema public from public, anon, authenticated;
-- is_admin() is used inside row-level policies, which run as the signed-in user.
grant execute on function take_portions, undo_pickup,
  post_listing, extend_listing, mark_gone, refresh_demo,
  submit_verification, list_verifications, review_venue, is_admin to authenticated;

commit;

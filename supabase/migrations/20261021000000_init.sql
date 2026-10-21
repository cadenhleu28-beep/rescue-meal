-- Rescue Meal database: tables, access rules, actions and demo data.
--
-- Visitors and the demo restaurant use anonymous sign-in, so every request has a user id
-- but nobody needs an account. Tables are read-only from the app; every change goes through
-- one of the functions below, which check the rules (no negative portions, one pickup per
-- person per listing, only the demo restaurant can edit its own posts).

begin;

-- Tables

create table venues (
  id text primary key,
  name text not null,
  kind text not null,
  address text not null,
  neighborhood text not null,
  lat double precision not null,
  lng double precision not null
);

create table listings (
  id text primary key default gen_random_uuid()::text,
  venue_id text not null references venues (id),
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '',
  category text not null check (category in ('bakery', 'meals', 'produce', 'grocery')),
  dietary text[] not null default '{}',
  allergens text[] not null default '{}',
  portions_total int not null check (portions_total between 1 and 500),
  portions_left int not null check (portions_left >= 0),
  posted_at timestamptz not null default now(),
  available_from timestamptz not null,
  available_until timestamptz not null,
  pickup_note text not null,
  reservable boolean not null default true,
  marked_gone boolean not null default false,
  check (available_until > available_from)
);

create index listings_venue_idx on listings (venue_id);

create table holds (
  listing_id text not null references listings (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code text not null,
  until timestamptz not null,
  primary key (listing_id, user_id)
);

create table pickups (
  listing_id text not null references listings (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  portions int not null check (portions >= 1),
  taken_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);

create table demo_meta (
  id boolean primary key default true check (id),
  seeded_at timestamptz
);
insert into demo_meta (seeded_at) values (null);

-- Access: everyone can read venues and listings; people only see their own holds and pickups.
-- No insert/update/delete policies, so writes only happen through the functions below.

alter table venues enable row level security;
alter table listings enable row level security;
alter table holds enable row level security;
alter table pickups enable row level security;
alter table demo_meta enable row level security;

create policy "Venues are public" on venues for select using (true);
create policy "Listings are public" on listings for select using (true);
create policy "See your own holds" on holds for select to authenticated using (user_id = auth.uid());
create policy "See your own pickups" on pickups for select to authenticated using (user_id = auth.uid());

-- Live updates for the map and counts.
alter publication supabase_realtime add table listings;

-- The partner dashboard is signed in as this venue until restaurants get real accounts.
create function demo_partner_id() returns text language sql immutable as $$ select 'v1' $$;

-- Helpers

-- Give back portions from reservations that ran out without a pickup.
create function release_expired_holds(p_listing text) returns void
language plpgsql security definer set search_path = public as $$
declare
  expired int;
begin
  with gone as (
    delete from holds where listing_id = p_listing and until <= now() returning 1
  )
  select count(*) into expired from gone;
  if expired > 0 then
    update listings set portions_left = portions_left + expired where id = p_listing;
  end if;
end $$;

create function require_user() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  return auth.uid();
end $$;

-- Visitor actions

create function reserve(p_listing text) returns holds
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  l listings;
  h holds;
begin
  perform release_expired_holds(p_listing);
  select * into l from listings where id = p_listing for update;
  if not found then raise exception 'Listing not found'; end if;
  if not l.reservable then raise exception 'This listing is first come, first served'; end if;
  if l.marked_gone or now() < l.available_from or now() >= l.available_until then
    raise exception 'This listing is not open right now';
  end if;
  if l.portions_left <= 0 then raise exception 'None left'; end if;
  if exists (select 1 from holds where listing_id = p_listing and user_id = uid) then
    raise exception 'You already have a reservation here';
  end if;
  if exists (select 1 from pickups where listing_id = p_listing and user_id = uid) then
    raise exception 'You already picked up from this listing';
  end if;

  update listings set portions_left = portions_left - 1 where id = p_listing;
  insert into holds (listing_id, user_id, code, until)
  values (
    p_listing,
    uid,
    (select string_agg(substr('ACDEFHJKMNPRTWXY3479', 1 + floor(random() * 20)::int, 1), '') from generate_series(1, 4)),
    least(now() + interval '20 minutes', l.available_until)
  )
  returning * into h;
  return h;
end $$;

create function cancel_hold(p_listing text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
begin
  perform 1 from listings where id = p_listing for update;
  delete from holds where listing_id = p_listing and user_id = uid and until > now();
  if found then
    update listings set portions_left = portions_left + 1 where id = p_listing;
  end if;
  perform release_expired_holds(p_listing);
end $$;

-- A visitor says how many portions they took. Their reservation, if any, already set one aside.
create function take_portions(p_listing text, p_portions int) returns pickups
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  l listings;
  held int;
  taken int;
  p pickups;
begin
  if p_portions is null or p_portions < 1 then raise exception 'Portions must be at least 1'; end if;
  perform release_expired_holds(p_listing);
  select * into l from listings where id = p_listing for update;
  if not found then raise exception 'Listing not found'; end if;
  if l.marked_gone or now() < l.available_from or now() >= l.available_until then
    raise exception 'This listing is not open right now';
  end if;
  if exists (select 1 from pickups where listing_id = p_listing and user_id = uid) then
    raise exception 'You already reported a pickup here';
  end if;

  delete from holds where listing_id = p_listing and user_id = uid;
  held := case when found then 1 else 0 end;
  taken := least(p_portions, l.portions_left + held);
  if taken < 1 then raise exception 'None left'; end if;

  update listings set portions_left = portions_left + held - taken where id = p_listing;
  insert into pickups (listing_id, user_id, portions) values (p_listing, uid, taken) returning * into p;
  return p;
end $$;

create function undo_pickup(p_listing text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  n int;
begin
  perform 1 from listings where id = p_listing for update;
  delete from pickups where listing_id = p_listing and user_id = uid returning portions into n;
  if n is not null then
    update listings set portions_left = least(portions_total, portions_left + n) where id = p_listing;
  end if;
end $$;

-- Restaurant actions (demo partner only)

create function post_listing(
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
  l listings;
begin
  perform require_user();
  if p_available_from < now() - interval '5 minutes' or p_available_until > now() + interval '1 day' then
    raise exception 'Pickup window is out of range';
  end if;
  if char_length(trim(coalesce(p_pickup_note, ''))) = 0 then raise exception 'Pickup note is required'; end if;

  insert into listings (venue_id, title, description, category, dietary, allergens, portions_total, portions_left,
                        available_from, available_until, pickup_note, reservable)
  values (demo_partner_id(), trim(p_title), trim(coalesce(p_description, '')), p_category,
          coalesce(p_dietary, '{}'), coalesce(p_allergens, '{}'), p_portions, p_portions,
          p_available_from, p_available_until, trim(p_pickup_note), coalesce(p_reservable, true))
  returning * into l;
  return l;
end $$;

create function extend_listing(p_listing text, p_minutes int) returns listings
language plpgsql security definer set search_path = public as $$
declare
  l listings;
begin
  perform require_user();
  if p_minutes not between 1 and 240 then raise exception 'Minutes out of range'; end if;
  update listings set available_until = available_until + make_interval(mins => p_minutes)
  where id = p_listing and venue_id = demo_partner_id() and not marked_gone
  returning * into l;
  if not found then raise exception 'Listing not found'; end if;
  return l;
end $$;

create function mark_gone(p_listing text) returns listings
language plpgsql security definer set search_path = public as $$
declare
  l listings;
begin
  perform require_user();
  update listings set marked_gone = true
  where id = p_listing and venue_id = demo_partner_id()
  returning * into l;
  if not found then raise exception 'Listing not found'; end if;
  return l;
end $$;

-- Demo data

insert into venues (id, name, kind, address, neighborhood, lat, lng) values
  ('v1', 'Half Loaf Bakery', 'Bakery', '584 Valencia St', 'Mission', 37.7637, -122.4219),
  ('v2', 'Comal Rojo', 'Taqueria', '2889 Mission St', 'Mission', 37.7518, -122.4183),
  ('v3', 'Hayes Street Grocer', 'Grocery', '410 Hayes St', 'Hayes Valley', 37.7768, -122.4235),
  ('v4', 'Larkin Bánh Mì', 'Vietnamese', '615 Larkin St', 'Tenderloin', 37.7833, -122.4178),
  ('v5', 'Northpoint Deli', 'Deli', '1290 Howard St', 'SoMa', 37.7758, -122.4129),
  ('v6', 'Ondo Ramen', 'Ramen', '2398 Market St', 'Castro', 37.7636, -122.4337),
  ('v7', 'Good Grain Café', 'Café', '3901 24th St', 'Noe Valley', 37.7517, -122.431),
  ('v8', 'Cortland Slice', 'Pizza', '430 Cortland Ave', 'Bernal Heights', 37.739, -122.4166),
  ('v9', 'Potrero Food Co-op', 'Grocery co-op', '1550 17th St', 'Potrero Hill', 37.7652, -122.399),
  ('v10', 'Daily Fold Dumplings', 'Dumplings', '1035 Folsom St', 'SoMa', 37.779, -122.4059),
  ('v11', 'Sunny Side Bagels', 'Bagels', '1801 Divisadero St', 'Western Addition', 37.7865, -122.4398),
  ('v12', 'Mama Lin''s Kitchen', 'Catering', '2150 Bryant St', 'Mission', 37.7605, -122.4105),
  ('v13', 'Kabul Grill', 'Afghan', '3120 16th St', 'Mission', 37.7648, -122.4225);

-- Puts the sample listings back, with times relative to now, if they're more than 6 hours old.
-- Posts made through the dashboard are left alone. Safe for anyone to call.
create function refresh_demo() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz := date_trunc('minute', now());
begin
  perform 1 from demo_meta where seeded_at is null or seeded_at < now() - interval '6 hours' for update;
  if not found then return false; end if;

  delete from listings where id in ('l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10', 'l11', 'l12', 'l13', 'h1', 'h2', 'h3');
  insert into listings (id, venue_id, title, description, category, dietary, allergens,
                        portions_total, portions_left, posted_at, available_from, available_until,
                        pickup_note, reservable, marked_gone)
  values
      ('l1', 'v1', 'Sourdough loaves and morning buns', 'Today''s bake that didn''t sell. About 8 whole sourdough loaves plus a tray of morning buns and a few cardamom knots.', 'bakery', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs']::text[],
       18, 11, t + interval '-40 minutes', t + interval '-40 minutes', t + interval '75 minutes',
       'Blue bin on the bench outside the front door. Please take two items max so more people get some.', false, false),
      ('l2', 'v2', 'Rice, beans and chicken tinga trays', 'Packed into single-serving containers with lids. Salsa verde on the side.', 'meals', array['gluten-free']::text[], '{}'::text[],
       25, 16, t + interval '-15 minutes', t + interval '-15 minutes', t + interval '45 minutes',
       'Ask at the register and say you saw it on Rescue Meal.', true, false),
      ('l3', 'v3', 'Apples, stone fruit and salad greens', 'Bruised or a little soft, but fine to eat. Greens are bagged. Bring a bag if you can.', 'produce', array['vegan', 'gluten-free']::text[], '{}'::text[],
       40, 30, t + interval '-90 minutes', t + interval '-90 minutes', t + interval '180 minutes',
       'Green crates by the side entrance on Linden St.', false, false),
      ('l4', 'v4', 'Bánh mì, pork and lemongrass tofu', 'Made this afternoon, wrapped individually. Tofu ones are marked with a green sticker.', 'meals', array['vegetarian']::text[], array['gluten', 'soy']::text[],
       14, 4, t + interval '-20 minutes', t + interval '-20 minutes', t + interval '22 minutes',
       'Counter pickup. Staff will hand them over.', true, false),
      ('l5', 'v5', 'Pre-packed sandwiches and grain salads', 'Turkey, ham and veggie sandwiches. Farro and quinoa salads. All dated today.', 'meals', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs']::text[],
       20, 12, t + interval '-5 minutes', t + interval '-5 minutes', t + interval '115 minutes',
       'Fridge by the front window, top two shelves.', true, false),
      ('l6', 'v6', 'Take-home ramen kits', 'Shoyu broth, fresh noodles and toppings packed separately. Reheat for 5 minutes.', 'meals', '{}'::text[], array['gluten', 'soy', 'eggs', 'sesame']::text[],
       10, 10, t + interval '-10 minutes', t + interval '50 minutes', t + interval '140 minutes',
       'Back door on Noe St after the dinner rush. Knock twice.', true, false),
      ('l7', 'v7', 'Muffins, scones and banana bread', 'Blueberry and bran muffins, cheddar scones, and two whole loaves of banana bread (contains walnuts).', 'bakery', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs', 'nuts']::text[],
       15, 9, t + interval '-60 minutes', t + interval '-60 minutes', t + interval '18 minutes',
       'Pastry case at the counter. Ask any barista.', true, false),
      ('l8', 'v8', 'Whole pies: cheese and veggie', 'Six large pies from a cancelled order. Boxed and still warm.', 'meals', array['vegetarian']::text[], array['gluten', 'dairy']::text[],
       6, 5, t + interval '-10 minutes', t + interval '-10 minutes', t + interval '95 minutes',
       'Front counter. One pie per person.', true, false),
      ('l9', 'v9', 'Yogurt, milk and cheese near sell-by', 'Sell-by is tomorrow. Everything has been kept refrigerated.', 'grocery', array['vegetarian', 'gluten-free']::text[], array['dairy']::text[],
       30, 22, t + interval '-120 minutes', t + interval '-120 minutes', t + interval '240 minutes',
       'Community fridge next to the entrance. Labeled "Free".', false, false),
      ('l10', 'v10', 'Frozen dumplings, pork and chive or veggie', 'Bags of 20, frozen today. Keep frozen until you cook them.', 'grocery', array['vegetarian']::text[], array['gluten', 'soy', 'sesame']::text[],
       24, 18, t + interval '-30 minutes', t + interval '-30 minutes', t + interval '150 minutes',
       'Ask at the takeout window.', true, false),
      ('l11', 'v11', 'Day-old bagels, mixed', 'Plain, sesame, everything and poppy. Great toasted.', 'bakery', array['vegan']::text[], array['gluten', 'sesame']::text[],
       60, 41, t + interval '-45 minutes', t + interval '-45 minutes', t + interval '60 minutes',
       'Paper bags on the rack by the door. Take a bag.', false, false),
      ('l12', 'v12', 'Event leftovers: lo mein, stir-fried greens, rice', 'From a lunch event today. Packed into family-size containers, each feeds about 3.', 'meals', array['vegetarian']::text[], array['gluten', 'soy']::text[],
       40, 33, t + interval '-10 minutes', t + interval '-10 minutes', t + interval '105 minutes',
       'Loading door on the Bryant St side. Ring the bell.', true, false),
      ('l13', 'v13', 'Chicken kebab plates with rice', 'Chicken kebab, saffron rice and salad. Halal certified.', 'meals', array['halal', 'gluten-free']::text[], array['dairy']::text[],
       12, 7, t + interval '-25 minutes', t + interval '-25 minutes', t + interval '55 minutes',
       'Front counter. Mention Rescue Meal.', true, false),
      ('h1', 'v1', 'Croissants and pain au chocolat', '', 'bakery', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs']::text[],
       24, 0, t + interval '-1560 minutes', t + interval '-1560 minutes', t + interval '-1440 minutes',
       'Blue bin outside the front door.', false, true),
      ('h2', 'v1', 'Seeded rye and baguettes', '', 'bakery', array['vegan']::text[], array['gluten', 'sesame']::text[],
       16, 3, t + interval '-3000 minutes', t + interval '-3000 minutes', t + interval '-2880 minutes',
       'Blue bin outside the front door.', false, false),
      ('h3', 'v1', 'Cookies and brownies', '', 'bakery', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs', 'nuts']::text[],
       30, 0, t + interval '-4440 minutes', t + interval '-4440 minutes', t + interval '-4320 minutes',
       'Counter.', true, true);

  update demo_meta set seeded_at = now();
  return true;
end $$;

select refresh_demo();

-- Only signed-in users (including anonymous ones) can call the actions.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function reserve, cancel_hold, take_portions, undo_pickup,
  post_listing, extend_listing, mark_gone, refresh_demo to authenticated;

commit;

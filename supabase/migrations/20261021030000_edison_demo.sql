-- Demo accounts for judges and visitors, and sample data moved to Edison, NJ.
--
-- "Try the demo" creates a throwaway account. A demo restaurant account gets its own venue that
-- is verified right away so it can post, but that venue and its posts are visible only to the
-- account that made them, so demo posts never reach anyone else's map.

begin;

alter table venues add column is_demo boolean not null default false;

create or replace function handle_new_user() returns trigger
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

  if r = 'restaurant' and coalesce((m ->> 'demo')::boolean, false) then
    -- Fixed details, so a demo account can't put a made-up business anywhere it likes.
    insert into venues (name, kind, address, neighborhood, lat, lng, owner_id, is_demo, verification_status)
    values ('Your Demo Kitchen', 'Restaurant', 'Oak Tree Rd, Edison', 'Oak Tree Road', 40.5731, -74.3470, new.id, true, 'verified');
  elsif r = 'restaurant' then
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

-- Demo venues and their posts are private to their owner.

drop policy "Signed-in users see venues" on venues;
create policy "Signed-in users see venues" on venues
  for select to authenticated using (not is_demo or owner_id = auth.uid());

drop policy "Signed-in users see listings from verified venues" on listings;
create policy "Signed-in users see listings from verified venues" on listings
  for select to authenticated using (
    exists (
      select 1 from venues v
      where v.id = listings.venue_id
        and ((v.verification_status = 'verified' and not v.is_demo) or v.owner_id = auth.uid())
    )
  );

-- Demo restaurants don't need reviewing, so keep them off the admin page.
create or replace function list_verifications()
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
    where not v.is_demo
    order by (v.verification_status = 'submitted') desc, r.submitted_at desc nulls last;
end $$;

-- Sample venues: made-up businesses on real Edison streets.

update venues as v set name = x.name, kind = x.kind, address = x.address, neighborhood = x.neighborhood, lat = x.lat, lng = x.lng
from (values
  ('v1', 'Morning Rise Bakery', 'Bakery', 'Grove Ave, Edison', 'Oakland Village', 40.5721, -74.3574),
  ('v2', 'Saffron Thali House', 'Gujarati', 'Oak Tree Rd, Edison', 'Oak Tree Road', 40.5728, -74.3438),
  ('v3', 'Stelton Fresh Market', 'Grocery', 'Plainfield Ave at Route 27, Edison', 'Stelton', 40.5141, -74.4039),
  ('v4', 'Lincoln Hwy Diner', 'Diner', 'Lincoln Hwy (Route 27), Edison', 'Menlo Park', 40.5538, -74.3478),
  ('v5', 'Parsonage Deli', 'Deli', 'Parsonage Rd, Edison', 'Menlo Park', 40.5505, -74.3390),
  ('v6', 'Route 1 Pho', 'Vietnamese', 'US Route 1, Edison', 'Menlo Park', 40.5440, -74.3330),
  ('v7', 'Mithai Mahal Sweets', 'Indian sweets', 'Oak Tree Rd, Edison', 'Oak Tree Road', 40.5735, -74.3520),
  ('v8', 'Clara Barton Slice', 'Pizza', 'Amboy Ave, Edison', 'Clara Barton', 40.5340, -74.3450),
  ('v9', 'Woodbridge Ave Food Co-op', 'Grocery co-op', 'Woodbridge Ave, Edison', 'Nixon', 40.5136, -74.3618),
  ('v10', 'Menlo Park Dumpling House', 'Dumplings', 'James St, Edison', 'Menlo Park', 40.5576, -74.3551),
  ('v11', 'North Edison Bagel Co.', 'Bagels', 'Inman Ave, Edison', 'North Edison', 40.5965, -74.3726),
  ('v12', 'Talmadge Road Catering', 'Catering', 'Talmadge Rd, Edison', 'Woodbrook Corners', 40.5591, -74.3884),
  ('v13', 'New Durham Halal Grill', 'Halal grill', 'New Durham Rd, Edison', 'New Durham', 40.5421, -74.3961)
) as x (id, name, kind, address, neighborhood, lat, lng)
where v.id = x.id;

-- Same timing as before (relative to now, refreshed when more than 6 hours old), Edison listings.
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
                        pickup_note, reservable, marked_gone)
  values
      ('l1', 'v1', 'Milk bread loaves and red bean buns', 'Today''s bake that didn''t sell. About 8 milk bread loaves plus a tray of red bean and custard buns.', 'bakery', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs']::text[],
       18, 11, t + interval '-40 minutes', t + interval '-40 minutes', t + interval '75 minutes',
       'Blue bin on the bench outside the front door. Please take two items max so more people get some.', false, false),
      ('l2', 'v2', 'Vegetarian thali boxes', 'Dal, rice, two sabzis and rotli, packed into single-serving containers with lids.', 'meals', array['vegetarian']::text[], array['gluten', 'dairy']::text[],
       25, 16, t + interval '-15 minutes', t + interval '-15 minutes', t + interval '45 minutes',
       'Ask at the register and say you saw it on Rescue Meal.', true, false),
      ('l3', 'v3', 'Apples, bananas and salad greens', 'Bruised or a little soft, but fine to eat. Greens are bagged. Bring a bag if you can.', 'produce', array['vegan', 'gluten-free']::text[], '{}'::text[],
       40, 30, t + interval '-90 minutes', t + interval '-90 minutes', t + interval '180 minutes',
       'Green crates by the side entrance off Plainfield Ave.', false, false),
      ('l4', 'v4', 'Turkey and veggie wraps, chicken soup', 'Made this afternoon. Wraps are wrapped individually, soup is in sealed quart containers. Veggie wraps have a green sticker.', 'meals', '{}'::text[], array['gluten', 'dairy']::text[],
       14, 4, t + interval '-20 minutes', t + interval '-20 minutes', t + interval '22 minutes',
       'Counter pickup. Staff will hand them over.', true, false),
      ('l5', 'v5', 'Pre-packed sandwiches and grain salads', 'Turkey, ham and veggie sandwiches. Farro and quinoa salads. All dated today.', 'meals', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs']::text[],
       20, 12, t + interval '-5 minutes', t + interval '-5 minutes', t + interval '115 minutes',
       'Fridge by the front window, top two shelves.', true, false),
      ('l6', 'v6', 'Take-home pho kits', 'Beef broth, rice noodles, herbs and bean sprouts packed separately. Heat the broth for 5 minutes.', 'meals', array['gluten-free']::text[], array['fish', 'soy']::text[],
       10, 10, t + interval '-10 minutes', t + interval '50 minutes', t + interval '140 minutes',
       'Side door by the parking lot after the dinner rush. Knock twice.', true, false),
      ('l7', 'v7', 'Boxes of mithai: ladoo, barfi and jalebi', 'Assorted sweets from today''s counter, boxed by the half pound. Some barfi has pistachio and cashew.', 'bakery', array['vegetarian']::text[], array['gluten', 'dairy', 'nuts']::text[],
       15, 9, t + interval '-60 minutes', t + interval '-60 minutes', t + interval '18 minutes',
       'Front counter. Ask anyone working.', true, false),
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
      ('l12', 'v12', 'Event leftovers: baked ziti, salad, garlic knots', 'From a lunch event today. Packed into family-size trays, each feeds about 3.', 'meals', array['vegetarian']::text[], array['gluten', 'dairy']::text[],
       40, 33, t + interval '-10 minutes', t + interval '-10 minutes', t + interval '105 minutes',
       'Loading door at the back of the building. Ring the bell.', true, false),
      ('l13', 'v13', 'Chicken over rice platters', 'Chicken, yellow rice and salad with white sauce on the side. Halal certified.', 'meals', array['halal', 'gluten-free']::text[], array['dairy', 'eggs']::text[],
       12, 7, t + interval '-25 minutes', t + interval '-25 minutes', t + interval '55 minutes',
       'Front counter. Mention Rescue Meal.', true, false),
      ('h1', 'v1', 'Croissants and danishes', '', 'bakery', array['vegetarian']::text[], array['gluten', 'dairy', 'eggs']::text[],
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

-- Reseed now so the Edison listings replace the old ones right away.
update demo_meta set seeded_at = null;
select refresh_demo();

commit;

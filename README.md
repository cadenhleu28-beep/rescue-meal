# Rescue Meal

Restaurants, bakeries and grocers post food they have left over. Anyone nearby finds it on a map and picks it up for free.

Built by Caden Leu and Veer Kansal (The Wardlaw-Hartridge School, Edison, NJ) for the 2026 Congressional App Challenge, New Jersey's 6th congressional district.

**Try it:** https://rescue-meal-flax.vercel.app. Click "someone looking for food" or "a restaurant" under the sign-up buttons to look around without making an account.

Data lives in [Supabase](https://supabase.com), so posts and pickup counts are shared across every device and update live.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL and anon key
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

Live at **https://rescue-meal-flax.vercel.app** (Vercel project `rescue-meal`). Deploy with `vercel deploy --prod`.

## Pages

- `/` **Landing page**: what Rescue Meal is, how it works, sign up / log in, or try the demo.
- `/find` **Find food** (signed-in users): list + map of everything available now or later today. Search, filter, sort, "Near me", details, directions, "I took some". Pickup is first come, first served.
- `/partner` **Restaurant dashboard** (restaurant accounts only): new restaurants first verify their business (license or permit number, phone, a photo or PDF of the document). Once approved: post extra food with a live preview, add time, mark as gone, see past posts.
- `/partner/counter/:id` **Counter mode** (restaurant accounts only): a full-screen, high-contrast screen for the register. Staff tap one big button for each portion they hand over (with an 8-second undo), see what's left and how long the pickup window has. The screen stays on while it's open.
- `/admin` **Verification review** (admins only): approve restaurants, or send them back with a reason.
- `/signup`, `/login`: email and password accounts. People choose "looking for food" or "I run a restaurant"; restaurants also give their business name and address and drop a pin for the pickup spot.
- `/how-it-works`: steps for both sides and the FAQ (including Good Samaritan liability protection).

## Stack

React 18 + TypeScript + Vite, React Router, Leaflet (via react-leaflet) with free [OpenFreeMap](https://openfreemap.org) vector tiles rendered through MapLibre. No API keys needed.

## Where things live

- `supabase/migrations/`: the database. Tables, access rules, the actions the app calls (`take_portions`, `post_listing`, …) and the sample data, which is set in Edison, NJ (made-up businesses on real streets). To move the demo to another city, change the venues and listings in the latest `refresh_demo()` and `DEMO_CENTER` in `src/lib/geo.ts`.
- `src/store.tsx`: loads data from Supabase, keeps it live, and wraps the database actions for the pages.
- `src/styles/`: plain CSS. Colors and fonts are variables at the top of `base.css`.

## How the backend works

- Accounts use Supabase email + password auth. Sign-up details are stored as user metadata, and a database trigger turns them into a `profiles` row (and a `venues` row for restaurants). Email confirmation is off, because Supabase's built-in email sender only delivers to the project's own team; set up custom SMTP before turning it back on.
- Restaurants can only post to and edit their own venue, and only after an admin verifies it. Verification details and documents (private `verification-docs` storage bucket) are visible only to the restaurant and admins.
- Nothing is readable without signing in; logged-out requests get empty results.
- "Try the demo" signs up a throwaway account (a random `@example.com` address and a random password). A demo restaurant gets its own venue that is verified straight away, but that venue and its posts are visible only to the account that made it, so demo posts never reach other people's maps. This relies on email confirmation being off.
- To make someone an admin, run in the Supabase SQL editor: `update profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');`
- The app can read listings but can't change them directly. Every change goes through a database function that checks the rules: no negative counts, one pickup report per person per listing. Counter taps (`decrement_portion`, `undo_decrement_portion`) are one atomic update each, so two registers and a visitor's report can't push a count below zero.
- Sample listings refresh themselves (with times relative to now) when they're more than 6 hours old. Posts made from the dashboard are kept.
- To set up a new Supabase project, run the files in `supabase/migrations/` in order in the SQL editor.

## Next steps

- Clean up old demo accounts automatically.
- Password reset and email confirmation (needs a custom SMTP provider in Supabase).
- Let restaurants edit their business details after sign-up.

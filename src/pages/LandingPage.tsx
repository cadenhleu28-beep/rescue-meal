import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { homeFor, useAuth } from '../auth'
import { CREATOR, PROJECT_STATUS } from '../data/creator'
import { FINDER_STEPS, PARTNER_STEPS } from '../data/steps'
import { MINUTE, clock, useNow } from '../lib/time'
import { PortionDemo } from '../components/PortionDemo'
import { TryDemo } from '../components/TryDemo'

const USDA_FOOD_WASTE = 'https://www.usda.gov/about-food/food-safety/food-loss-and-waste/food-waste-faqs'
const LIABILITY_SOURCE = 'https://policyfinder.refed.org/federal-policy/federal-liability-protection'
// New Jersey's Office of the Food Security Advocate, citing Feeding America's Map the Meal Gap (2023 data).
const NJ_FOOD_SECURITY = 'https://www.nj.gov/foodsecurity/documents/The%20State%20of%20Food%20Security%20in%20New%20Jersey%20-%20A%20Data%20Chart%20Book_12.10.2025_FINAL.pdf'

export default function LandingPage() {
  const { profile } = useAuth()
  const now = useNow(60_000)

  // Using the app takes an account, so logged-out buttons lead to sign-up for the right role.
  const seekerHref = profile ? homeFor(profile) : '/signup'
  const seekerLabel = profile?.role === 'restaurant' ? 'Go to your dashboard' : profile ? 'Open the map' : 'Find food near me'
  // Visitors with a food-seeker account can't post, so they don't get the restaurant button.
  const showRestaurantCta = !profile || profile.role === 'restaurant'
  const restaurantHref = profile ? '/partner' : '/signup?as=restaurant'

  const maker = [
    CREATOR.name,
    CREATOR.school && `students at ${CREATOR.school}`,
    CREATOR.district && `in ${CREATOR.district}`,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <h1>Free food from restaurants near you, before they close.</h1>
          <p className="hero-sub">
            Restaurants, bakeries and grocers post what’s left at the end of the day. You see it on a map, hold a
            portion for 20 minutes, and pick it up.
          </p>
          <div className="hero-actions">
            <Link to={seekerHref} className="btn btn-primary btn-lg">
              {seekerLabel}
            </Link>
            {!profile && (
              <Link to={restaurantHref} className="btn btn-secondary btn-lg">
                Post leftover food
              </Link>
            )}
          </div>
          <p className="hero-note">
            Free for everyone. Every restaurant is verified before it can post.{' '}
            {!profile && (
              <>
                Already have an account? <Link to="/login">Log in</Link>
              </>
            )}
          </p>
          {!profile && <TryDemo className="try-demo" />}
        </div>

        <figure className="hero-shot">
          <img
            src="/screens/map-listing.webp"
            width={1110}
            height={741}
            alt="The Rescue Meal map of Edison, New Jersey with food pins, and a listing for pre-packed sandwiches open in the side panel showing 12 of 20 portions left."
            fetchPriority="high"
          />
          <figcaption>
            The map, with example listings in Edison, NJ. Real posts appear once local restaurants join.
          </figcaption>
        </figure>
      </section>

      <section className="problem">
        <h2>Good food shouldn’t end the night in the trash.</h2>
        <p>
          The USDA estimates that{' '}
          <a href={USDA_FOOD_WASTE} target="_blank" rel="noreferrer">
            30 to 40 percent of the U.S. food supply goes to waste
          </a>
          . At the same time,{' '}
          <a href={NJ_FOOD_SECURITY} target="_blank" rel="noreferrer">
            about 1 in 10 people in Middlesex County
          </a>{' '}
          didn’t always have enough to eat in 2023. Much of what restaurants and stores throw out at closing is
          still good to eat. They just don’t have a quick way to tell people nearby that it’s there, and the people
          who could use it don’t have a way to find out.
        </p>
      </section>

      <section className="mechanic">
        <div className="mechanic-copy">
          <h2>Reserve a portion and it’s held for 20 minutes.</h2>
          <p>
            Tap reserve and you get a four-letter code to show at the counter. If plans change, cancel it, or let it
            lapse and the portion goes back for someone else.
          </p>
        </div>
        <figure className="demo demo--narrow">
          <div className="demo-ui">
            <p className="demo-listing">
              <strong>Vegetarian thali boxes</strong>
              <span>Saffron Thali House · Oak Tree Road</span>
            </p>
            <div className="hold">
              <div className="hold-head">
                <Check size={18} strokeWidth={2.5} />
                <span>
                  Saved for you until <strong>{clock(now + 20 * MINUTE)}</strong>
                </span>
              </div>
              <p>
                Show this code at pickup: <span className="hold-code">K7MX</span>
              </p>
            </div>
          </div>
          <figcaption>Example reservation</figcaption>
        </figure>
      </section>

      <section className="mechanic mechanic--flip">
        <div className="mechanic-copy">
          <h2>When you pick up, say how much you took. The count updates for everyone.</h2>
          <p>
            Most free-food listings go stale: you show up and it’s gone. Here, the people picking up keep the count
            honest, so the restaurant never has to, and nobody makes a trip for food that isn’t there.
          </p>
        </div>
        <figure className="demo">
          <PortionDemo />
          <figcaption>Example of the “I took some” step</figcaption>
        </figure>
      </section>

      <section className="audiences" aria-label="How it works">
        <div>
          <h2>If you’re looking for food</h2>
          <ol className="steps">
            {FINDER_STEPS.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <Link to={seekerHref} className="btn btn-primary">
            {seekerLabel}
          </Link>
        </div>
        <div>
          <h2>If you run a restaurant, bakery or store</h2>
          <ol className="steps">
            {PARTNER_STEPS.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="safety-note">
            <strong>About liability.</strong> Food donated in good faith is protected under the federal Bill Emerson
            Good Samaritan Food Donation Act, except in cases of gross negligence or intentional misconduct. The Food
            Donation Improvement Act of 2022 extended that protection to food given directly to people for free.{' '}
            <a href={LIABILITY_SOURCE} target="_blank" rel="noreferrer">
              Read a summary of the law
            </a>
            .
          </p>
          {showRestaurantCta && (
            <Link to={restaurantHref} className="btn btn-secondary">
              Post leftover food
            </Link>
          )}
        </div>
      </section>

      <section className="maker">
        <div>
          <h2>Who made this</h2>
          <p>
            Rescue Meal is a student project built for the 2026 Congressional App Challenge
            {maker ? ` by ${maker}` : ''}.
          </p>
          <p className="maker-status">{PROJECT_STATUS}</p>
          {(CREATOR.email || CREATOR.githubUrl || CREATOR.demoVideoUrl) && (
            <p className="maker-links">
              {CREATOR.demoVideoUrl && (
                <a href={CREATOR.demoVideoUrl} target="_blank" rel="noreferrer">
                  Watch the demo
                </a>
              )}
              {CREATOR.githubUrl && (
                <a href={CREATOR.githubUrl} target="_blank" rel="noreferrer">
                  Source code on GitHub
                </a>
              )}
              {CREATOR.email && <a href={`mailto:${CREATOR.email}`}>{CREATOR.email}</a>}
            </p>
          )}
        </div>
        <div>
          <h3>How it’s built</h3>
          <p>
            React and TypeScript, with a Leaflet map on OpenStreetMap data. Supabase (Postgres) stores listings,
            handles accounts, and pushes count changes to every open map in real time. Database functions enforce
            the rules, so a count can’t go below zero and a restaurant can only edit its own posts. Hosted on Vercel.
          </p>
          <p>
            <Link to="/how-it-works">Questions and answers</Link>
          </p>
        </div>
      </section>

      <footer className="site-foot">
        <span>Rescue Meal</span>
        <span>2026 Congressional App Challenge</span>
      </footer>
    </main>
  )
}

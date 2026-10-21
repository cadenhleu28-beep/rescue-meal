import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FINDER_STEPS, PARTNER_STEPS } from '../data/steps'

const FAQ = [
  {
    id: 'cost',
    q: 'Does it cost anything?',
    a: 'No. Restaurants don’t pay to post and nobody pays to pick up.',
  },
  {
    id: 'account',
    q: 'Do I need an account to get food?',
    a: 'Yes, a free one. It takes about a minute and only needs your name, email and a password. Accounts let you reserve a portion and tell others how much you took, and they keep the map for real people nearby.',
  },
  {
    id: 'verification',
    q: 'How do you know a restaurant is real?',
    a: 'Every business is verified before it can post. When a restaurant signs up, it sends its business license, food service permit or health permit number, a photo of the document and a phone number. We check them by hand, and only approved businesses can put food on the map.',
  },
  {
    id: 'safety',
    q: 'Are restaurants protected if they give food away?',
    a: 'In the U.S., the Bill Emerson Good Samaritan Food Donation Act protects businesses that donate food in good faith. The Food Donation Improvement Act of 2022 extended that protection to food given directly to people at no cost, which is how Rescue Meal works.',
  },
  {
    id: 'food-safety',
    q: 'How do I know the food is OK to eat?',
    a: 'Before anything goes live, the restaurant confirms it was stored at safe temperatures and isn’t past its use-by date, and lists common allergens. If something looks or smells off, skip it and use “Report a problem” on the post.',
  },
  {
    id: 'what',
    q: 'What kind of food gets posted?',
    a: 'Mostly bread and pastries from the day, prepared food that didn’t sell, produce that’s bruised but fine, and groceries close to their sell-by date.',
  },
]

export default function AboutPage() {
  const { hash } = useLocation()

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
    else window.scrollTo(0, 0)
  }, [hash])

  return (
    <main className="about">
      <section className="about-hero">
        <h1>Extra food from local restaurants, free for anyone nearby.</h1>
        <p>
          At closing time a lot of good food has nowhere to go. Rescue Meal gives restaurants, bakeries and grocers a quick
          way to post what’s left and where to grab it, and puts those posts on a map for people in the neighborhood.
        </p>
        <div className="about-actions">
          <Link to="/signup" className="btn btn-primary btn-lg">
            Find food near me
          </Link>
          <Link to="/signup?as=restaurant" className="btn btn-secondary btn-lg">
            Post leftover food
          </Link>
        </div>
      </section>

      <section className="about-steps">
        <div>
          <h2>Looking for food</h2>
          <ol className="steps">
            {FINDER_STEPS.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2>Running a restaurant, bakery or store</h2>
          <ol className="steps">
            {PARTNER_STEPS.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="about-why">
        <h2>Why this matters</h2>
        <p>
          The USDA estimates that{' '}
          <a href="https://www.usda.gov/about-food/food-safety/food-loss-and-waste/food-waste-faqs" target="_blank" rel="noreferrer">
            30 to 40 percent of the U.S. food supply goes to waste
          </a>
          , while{' '}
          <a
            href="https://www.nj.gov/foodsecurity/documents/The%20State%20of%20Food%20Security%20in%20New%20Jersey%20-%20A%20Data%20Chart%20Book_12.10.2025_FINAL.pdf"
            target="_blank"
            rel="noreferrer"
          >
            10.4 percent of people in Middlesex County
          </a>{' '}
          were food insecure in 2023. A lot of that wasted food is good food from restaurants and stores that had no
          quick way to tell anyone it was there.
        </p>
      </section>

      <section className="faq">
        <h2>Questions</h2>
        {FAQ.map((item) => (
          <details key={item.id} id={item.id} open={hash === `#${item.id}` || undefined}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </section>

      <footer className="site-foot">
        <span>Rescue Meal</span>
        <span>2026 Congressional App Challenge</span>
      </footer>
    </main>
  )
}

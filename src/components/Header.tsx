import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LogOut, Plus } from 'lucide-react'
import { useAuth } from '../auth'
import { LogoMark } from './Logo'

export function Header() {
  const { profile, logOut } = useAuth()
  const navigate = useNavigate()
  const isRestaurant = profile?.role === 'restaurant'

  // The app itself is for signed-in users; logged-out visitors only see the public pages.
  const links = [
    ...(profile ? [{ to: '/find', label: 'Find food', short: 'Find' }] : []),
    ...(isRestaurant ? [{ to: '/partner', label: 'Your dashboard', short: 'Dashboard' }] : []),
    ...(profile?.isAdmin ? [{ to: '/admin', label: 'Review', short: 'Review' }] : []),
    { to: '/how-it-works', label: 'How it works', short: 'About' },
  ]

  return (
    <header className="header">
      <Link to="/" className="brand" aria-label="Rescue Meal home">
        <LogoMark size={26} />
        <span>Rescue Meal</span>
      </Link>
      <nav className="nav" aria-label="Main">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to}>
            <span className="nav-long">{l.label}</span>
            <span className="nav-short">{l.short}</span>
          </NavLink>
        ))}
      </nav>
      <div className="header-actions">
        {profile ? (
          <>
            {isRestaurant && (
              <Link to="/partner" className="btn btn-primary btn-sm header-cta">
                <Plus size={16} strokeWidth={2.4} />
                Post extra food
              </Link>
            )}
            <span className="header-user">{profile.displayName}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await logOut()
                navigate('/')
              }}
            >
              <LogOut size={15} />
              <span className="header-long">Log out</span>
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-ghost btn-sm">
              Log in
            </Link>
            <Link to="/signup" className="btn btn-primary btn-sm header-long">
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  )
}

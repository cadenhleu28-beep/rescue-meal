import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { StoreProvider } from './store'
import { loginLink } from './lib/nav'
import { Header } from './components/Header'
import LandingPage from './pages/LandingPage'
import AboutPage from './pages/AboutPage'
import LoginPage from './pages/LoginPage'

// The map library is large; only pages that show a map load it.
const FindPage = lazy(() => import('./pages/FindPage'))
const PartnerPage = lazy(() => import('./pages/PartnerPage'))
const CounterPage = lazy(() => import('./pages/CounterPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))

type Gate = 'member' | 'restaurant' | 'admin'

/** Sends people who aren't allowed on a page to log in (or to the map, if they're signed in). */
function RequireAccount({ gate, children }: { gate: Gate; children: ReactNode }) {
  const { status, profile } = useAuth()
  const { pathname, search } = useLocation()
  if (status === 'loading') return null
  if (!profile) return <Navigate to={loginLink(pathname + search)} replace />
  if (gate === 'restaurant' && profile.role !== 'restaurant') return <Navigate to="/find" replace />
  if (gate === 'admin' && !profile.isAdmin) return <Navigate to="/find" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <Header />
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/find"
              element={
                <RequireAccount gate="member">
                  <FindPage />
                </RequireAccount>
              }
            />
            <Route
              path="/partner"
              element={
                <RequireAccount gate="restaurant">
                  <PartnerPage />
                </RequireAccount>
              }
            />
            <Route
              path="/partner/counter/:id"
              element={
                <RequireAccount gate="restaurant">
                  <CounterPage />
                </RequireAccount>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAccount gate="admin">
                  <AdminPage />
                </RequireAccount>
              }
            />
            <Route path="/how-it-works" element={<AboutPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </StoreProvider>
    </AuthProvider>
  )
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/schibsted-grotesk'
import 'leaflet/dist/leaflet.css'
import './styles/base.css'
import './styles/find.css'
import './styles/partner.css'
import './styles/about.css'
import './styles/landing.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

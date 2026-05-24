import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Register the service worker (vite-plugin-pwa generates this virtual module).
// `autoUpdate` mode in vite.config silently refreshes when a new SW is available.
if (typeof window !== 'undefined') {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true })
    })
    .catch(() => {
      // ignored in environments without the plugin (e.g. some test runners)
    })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

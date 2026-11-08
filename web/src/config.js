/**
 * Application environment configuration for Sauti ya Dere.
 * Connects to local backend in development and live Render backend in production.
 */
const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

export const API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  (isLocalhost ? 'http://localhost:8000' : 'https://sautiyaderebackend.onrender.com')

export function getApiUrl(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  if (!API_BASE_URL || API_BASE_URL === '/') {
    return cleanEndpoint
  }
  return `${API_BASE_URL.replace(/\/+$/, '')}${cleanEndpoint}`
}

export default { API_BASE_URL, getApiUrl }

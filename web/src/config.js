/**
 * Application environment configuration for Sauti ya Dere.
 * Connects to live Render backend for both local testing and production.
 */
export const API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  'https://sautiyaderebackend.onrender.com'

export function getApiUrl(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  if (!API_BASE_URL || API_BASE_URL === '/') {
    return cleanEndpoint
  }
  return `${API_BASE_URL.replace(/\/+$/, '')}${cleanEndpoint}`
}

export default { API_BASE_URL, getApiUrl }
/**
 * Application environment configuration for Sauti ya Dere.
 * Configures the backend API base URL to toggle between development (http://localhost:8000)
 * and production via import.meta.env.VITE_API_BASE_URL.
 */

export const API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  'http://localhost:8000'

/**
 * Resolves an API endpoint against the configured API_BASE_URL.
 *
 * @param {string} endpoint - API route (e.g. '/api/analyze')
 * @returns {string} Fully qualified or relative API URL
 */
export function getApiUrl(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  if (!API_BASE_URL || API_BASE_URL === '/') {
    return cleanEndpoint
  }
  return `${API_BASE_URL.replace(/\/+$/, '')}${cleanEndpoint}`
}

export default {
  API_BASE_URL,
  getApiUrl
}

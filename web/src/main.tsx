import React from 'react'
import { createRoot } from 'react-dom/client'
import './global.css'
import SautiWizard from './components/wizard/SautiWizard'

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <SautiWizard />
    </React.StrictMode>
  )
}

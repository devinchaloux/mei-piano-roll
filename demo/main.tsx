import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Demo from './Demo'

document.body.style.background = '#0c0e14'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import WagonScada3D from './components/WagonScada3D'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WagonScada3D />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { VideoLibraryDashboard } from './pages/VideoLibraryDashboard.tsx'
import { TopNavigation } from './components/TopNavigation.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TopNavigation />
      <Routes>
        <Route path="/" element={<VideoLibraryDashboard />} />
        <Route path="/detection" element={<App />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

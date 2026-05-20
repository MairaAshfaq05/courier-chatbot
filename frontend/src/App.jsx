import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './useAuth'
import Layout from './Layout'
import ChatPage from './ChatPage'
import AnalyticsPage from './AnalyticsPage'
import TrackPage from './TrackPage'
import ComplaintsPage from './ComplaintsPage'
import LoginPage from './LoginPage'
import QRScannerPage from './QRScannerPage'
import AgentDashboardPage from './AgentDashboardPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/chat" replace />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="track" element={<TrackPage />} />
            <Route path="complaints" element={<ComplaintsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="qr" element={<QRScannerPage />} />
            <Route path="agent" element={<AgentDashboardPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
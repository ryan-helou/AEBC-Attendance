import { Routes, Route } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/LandingPage'
import AttendancePage from './pages/AttendancePage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGate />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/attendance/:meetingId" element={<AttendancePage />} />
      </Route>
    </Routes>
  )
}

export default App

import { Routes, Route } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/LandingPage'
import AttendancePage from './pages/AttendancePage'
import DataPage from './pages/DataPage'
import HistoryPage from './pages/HistoryPage'
import PersonProfilePage from './pages/PersonProfilePage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGate />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/attendance/:meetingId/:date" element={<AttendancePage />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/person/:personId" element={<PersonProfilePage />} />
      </Route>
    </Routes>
  )
}

export default App

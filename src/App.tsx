import { Routes, Route } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/LandingPage'
import AttendancePage from './pages/AttendancePage'
import DataPage from './pages/DataPage'
import HistoryPage from './pages/HistoryPage'
import PersonProfilePage from './pages/PersonProfilePage'
import IdeasPage from './pages/IdeasPage'
import GamesPage from './pages/GamesPage'
import TetrisPage from './pages/TetrisPage'
import BreakoutPage from './pages/BreakoutPage'
import ChessPuzzlePage from './pages/ChessPuzzlePage'
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
        <Route path="/ideas" element={<IdeasPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/tetris" element={<TetrisPage />} />
        <Route path="/games/breakout" element={<BreakoutPage />} />
        <Route path="/games/chess" element={<ChessPuzzlePage />} />
      </Route>
    </Routes>
  )
}

export default App

import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import AboutMe from './pages/AboutMe.jsx'


function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/aboutme" element={<AboutMe />} />
    </Routes>
  )
}

export default App

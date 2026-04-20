import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProjectPicker } from './pages/ProjectPicker'
import { Canvas } from './pages/Canvas'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectPicker />} />
        <Route path="/p/:projectId" element={<Canvas />} />
      </Routes>
    </BrowserRouter>
  )
}

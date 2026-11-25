import React from 'react';
import { HashRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './hooks';
import { AccidentAnalysis, CameraMonitoring, Dashboard, LiveDetection, Login, LoginHistory, RawDataCatalog, SavedArchive } from './pages';

// HashRouter works on any static host without rewrite rules. Embedded builds
// (e.g. a claude.ai artifact, where the host owns the URL) set VITE_ROUTER=memory.
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : HashRouter;

const App: React.FC = () => (
  <AuthProvider>
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/monitoring" element={<ProtectedRoute><CameraMonitoring /></ProtectedRoute>} />
        <Route path="/live" element={<ProtectedRoute><LiveDetection /></ProtectedRoute>} />
        <Route path="/analysis" element={<ProtectedRoute><AccidentAnalysis /></ProtectedRoute>} />
        <Route path="/archive" element={<ProtectedRoute><SavedArchive /></ProtectedRoute>} />
        <Route path="/catalog" element={<ProtectedRoute><RawDataCatalog /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute permission="logs:view"><LoginHistory /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  </AuthProvider>
);

export default App;

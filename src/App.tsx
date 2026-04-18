import React from 'react';
import { BrowserRouter, Routes, Route, Outlet, useLocation } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './ProtectedRoute';
import Sidebar from './components/Sidebar';
import Login from './pages/Login.tsx';
import Dashboard from './pages/Dashboard.tsx';
import Chat from './pages/Chat.tsx';
import Upload from './pages/Upload.tsx';
import History from './pages/History.tsx';
import Admin from './pages/Admin.tsx';
import './App.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const REQUIRED_ENV_VARS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_API_BASE_URL'];
const missingEnvVars = REQUIRED_ENV_VARS.filter(key => !import.meta.env[key]);

import { useAuth } from './context/AuthContext';
import { Navigate } from 'react-router-dom';

const AuthRedirect: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/chat" replace />;
  return <>{children}</>;
};

import { motion, AnimatePresence } from 'framer-motion';

const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.3 }}
  >
    {children}
  </motion.div>
);

const MainLayout = () => {
  const { pathname } = useLocation();
  const isChatPage = pathname === '/chat';

  return (
    <div className="main-layout">
      {!isChatPage && <Sidebar />}
      <main className={`main-content ${isChatPage ? 'full-width' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
};

function App() {
  if (missingEnvVars.length > 0) {
    return (
      <div style={{ padding: '2rem', color: '#ff4a4a', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h2>⚠️ Configuration Error</h2>
        <p>The application is missing required frontend environment variables.</p>
        <p>Please check your <code>client/.env.local</code> file or Vercel environment variables.</p>
        <ul style={{ textAlign: 'left', background: '#ffecec', padding: '1rem', borderRadius: '8px' }}>
          {missingEnvVars.map(v => <li key={v}>Missing: <strong>{v}</strong></li>)}
        </ul>
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PageWrapper><AuthRedirect><Login /></AuthRedirect></PageWrapper>} />
            <Route path="/login" element={<PageWrapper><AuthRedirect><Login /></AuthRedirect></PageWrapper>} />
            <Route path="/landing" element={<PageWrapper><Login /></PageWrapper>} />
            <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<PageWrapper><Dashboard /></PageWrapper>} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/upload" element={<PageWrapper><Upload /></PageWrapper>} />
              <Route path="/history" element={<PageWrapper><History /></PageWrapper>} />
              <Route path="/admin" element={<PageWrapper><Admin /></PageWrapper>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;

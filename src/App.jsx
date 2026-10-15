import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import LoginPage from './pages/LoginPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EditorPage from './pages/EditorPage.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const location = useLocation();

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="center-screen"><div className="spinner" /></div>;

  const guard = (el) => (user ? el : <Navigate to="/login" replace state={{ from: location.pathname }} />);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={location.state?.from || '/'} replace /> : <LoginPage />} />
        <Route path="/" element={guard(<Dashboard />)} />
        <Route path="/d/:id" element={guard(<EditorPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}

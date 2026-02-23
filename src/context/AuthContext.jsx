import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('nv_token');
    if (token) {
      api.setToken(token);
      api.getMe()
        .then((data) => setUser(data.user))
        .catch(() => {
          api.logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    return data;
  }, []);

  const register = useCallback(async (username, email, password, displayName) => {
    const data = await api.register(username, email, password, displayName);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

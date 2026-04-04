import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';
import wsService from '../services/websocket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(sessionStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data.user);
          wsService.connect(token);
        } catch (err) {
          // Only clear session if the token is actually invalid (401/403)
          // For network errors or server errors, keep the token so the session
          // can recover when the backend comes back online
          const status = err.response?.status;
          if (status === 401 || status === 403) {
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
            setToken(null);
            setUser(null);
            wsService.disconnect();
          } else {
            // Backend might be starting up — restore user from sessionStorage cache
            const cachedUser = sessionStorage.getItem('user');
            if (cachedUser) {
              try {
                setUser(JSON.parse(cachedUser));
                wsService.connect(token);
              } catch {
                // Corrupted cache — clear everything
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('user');
                setToken(null);
                setUser(null);
              }
            }
          }
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token: newToken, user: userData } = res.data;
    sessionStorage.setItem('token', newToken);
    sessionStorage.setItem('user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    wsService.connect(newToken);
    return userData;
  };

  const register = async (username, email, password, role = 'member') => {
    const res = await api.post('/auth/register', { username, email, password, role });
    const { token: newToken, user: userData } = res.data;
    sessionStorage.setItem('token', newToken);
    sessionStorage.setItem('user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    wsService.connect(newToken);
    return userData;
  };

  const logout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setToken(null);
    setUser(null);
    wsService.disconnect();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

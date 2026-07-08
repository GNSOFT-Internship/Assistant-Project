import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState({ username: 'admin', role: 'ADMIN' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 자동 로그인 - 더미 사용자 설정
    setUser({ username: 'admin', role: 'ADMIN' });
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    // 임시 로그인 - 항상 성공
    setUser({ username: username || 'admin', role: 'ADMIN' });
    return true;
  };

  const logout = () => {
    setUser({ username: 'admin', role: 'ADMIN' });
  };

  const isAuthenticated = () => true;

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SettingsContext = createContext(null);

const THEME_KEY = 'app_theme'; // 'light' | 'dark'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  // 저장된 값이 없으면 OS/브라우저의 다크모드 선호도를 첫 기본값으로 사용
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function SettingsProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  // <html> 태그의 class="dark"를 실제로 갈아끼운다.
  // Tailwind의 dark: variant는 이 클래스를 기준으로 동작한다 (tailwind.config.js의 darkMode: 'class').
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings는 SettingsProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}

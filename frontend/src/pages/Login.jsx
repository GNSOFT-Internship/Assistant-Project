import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { Sun, Moon, AlertTriangle } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme } = useSettings();

  const checkCapsLock = (e) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(username, password);
      if (!result.success) {
        setError(result.message || '아이디 또는 비밀번호가 잘못되었습니다');
      }
      // 성공 시에는 로그인 상태가 갱신되면서 LoginRoute가 자동으로 /dashboard로 이동시킨다.
    } catch {
      setError('로그인 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4 overflow-hidden">
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        className="absolute top-4 right-4 z-20 p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      {/* 백그라운드 그라데이션 블롭 데코레이션 */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-blue-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse pointer-events-none"></div>

      <div className="relative max-w-md w-full z-10">
        <div className="flex flex-col items-center mb-8">

         <img
            src={theme === 'dark' ? '/model-dark.png' : '/model.png'}
            alt="자산관리 로고"
            className="w-[200px] h-[200px] object-contain"
/>

          <h2 className="text-center text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            자산관리 의사결정 시스템
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">
            공공기관 시설·자산 정보 관리 및 LLM 분석 포털
          </p>
        </div>

        <div className="card border border-slate-100/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm shadow-xl shadow-slate-100">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3">
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                사용자명
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="input"
                placeholder="사용자명을 입력하세요"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  비밀번호
                </label>
                {capsLockOn && (
                  <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={13} />
                    Caps Lock이 켜져있어요
                  </span>
                )}
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="input"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={checkCapsLock}
                onKeyUp={checkCapsLock}
                onBlur={() => setCapsLockOn(false)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>

        <div className="text-center text-sm text-gray-500 dark:text-slate-400 mt-6 space-y-1">
          <p>관리자: admin / admin123</p>
          <p>일반 사용자: user / user123</p>
        </div>
      </div>
    </div>
  );
}
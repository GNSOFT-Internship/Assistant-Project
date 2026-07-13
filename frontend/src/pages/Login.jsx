import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

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
    } catch (err) {
      setError('로그인 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-50 flex items-center justify-center px-4 overflow-hidden">
      {/* 백그라운드 그라데이션 블롭 데코레이션 */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-blue-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse pointer-events-none"></div>

      <div className="relative max-w-md w-full z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-extrabold text-2xl shadow-md shadow-blue-500/20 mb-4">
            자
          </div>
          <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight">
            자산관리 의사결정 시스템
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500 font-medium">
            공공기관 시설·자산 정보 관리 및 LLM 분석 포털
          </p>
        </div>

        <div className="card border border-slate-100/80 bg-white/90 backdrop-blur-sm shadow-xl shadow-slate-100">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
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
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="input"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

        <div className="text-center text-sm text-gray-500 mt-6 space-y-1">
          <p>관리자: admin / admin123</p>
          <p>일반 사용자: user / user123</p>
        </div>
      </div>
    </div>
  );
}
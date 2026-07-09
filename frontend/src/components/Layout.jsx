import React from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Package, Wrench, Lightbulb, MessageSquare,
  Upload, FileText, LogOut, Search
} from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { path: '/dashboard', label: '대시보드', icon: LayoutDashboard },
    { path: '/assets', label: '자산 관리', icon: Package },
    { path: '/maintenance', label: '유지보수 분석', icon: Wrench },
    { path: '/search', label: '자연어 검색', icon: Search },
    { path: '/recommendations', label: '교체 추천', icon: Lightbulb },
    { path: '/qa', label: '질문하기', icon: MessageSquare },
    { path: '/files', label: '파일 업로드', icon: Upload },
    { path: '/reports', label: '보고서', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex items-center min-w-0">
              <div className="flex-shrink-0 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                  자
                </div>
                <h1 className="text-lg font-bold text-gray-900 hidden sm:block whitespace-nowrap">
                  자산관리 시스템
                </h1>
              </div>
              <div className="hidden lg:flex ml-8 space-x-1 overflow-x-auto">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                  {user?.username?.[0]?.toUpperCase()}
                </div>
                <span>{user?.username}</span>
              </div>
              <button
                onClick={handleLogout}
                title="로그아웃"
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
          <div className="lg:hidden flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap flex-shrink-0 transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={14} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 px-4">
        <Outlet />
      </main>
    </div>
  );
}
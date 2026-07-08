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
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-blue-600">자산관리 시스템</h1>
              </div>
              <div className="hidden md:flex ml-10 space-x-2">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1 ${
                        location.pathname === item.path
                          ? 'bg-blue-100 text-blue-600'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user?.username}</span>
              <button
                onClick={handleLogout}
                className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 px-4">
        <Outlet />
      </main>
    </div>
  );
}
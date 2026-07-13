import React, { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Package, Wrench, Lightbulb, MessageSquare,
  Upload, FileText, LogOut, Wallet, ChevronLeft, ChevronRight, ScrollText
} from 'lucide-react';

function ScrollableNav({ items, activePath, variant }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const scrollByAmount = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollLeft + direction * 220, behavior: 'smooth' });
  };

  const isMobile = variant === 'mobile';
  const itemClass = isMobile
    ? 'px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap flex-shrink-0 transition-colors'
    : 'px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 transition-colors';
  const iconSize = isMobile ? 14 : 16;

  return (
    <div className="relative flex items-center min-w-0 flex-1">
      {canScrollLeft && (
        <button
          onClick={() => scrollByAmount(-1)}
          aria-label="이전 메뉴"
          className="absolute left-0 z-10 h-full px-1 flex items-center bg-gradient-to-r from-white via-white to-transparent"
        >
          <ChevronLeft size={16} className="text-gray-500" />
        </button>
      )}
      <div
        ref={scrollRef}
        className={`flex ${isMobile ? 'gap-1' : 'space-x-1'} overflow-x-auto scrollbar-hide`}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = activePath === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`${itemClass} ${
                active
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/25 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon size={iconSize} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
      {canScrollRight && (
        <button
          onClick={() => scrollByAmount(1)}
          aria-label="다음 메뉴"
          className="absolute right-0 z-10 h-full px-1 flex items-center bg-gradient-to-l from-white via-white to-transparent"
        >
          <ChevronRight size={16} className="text-gray-500" />
        </button>
      )}
    </div>
  );
}

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
    { path: '/recommendations', label: '교체 추천', icon: Lightbulb },
    { path: '/qa', label: 'AI 어시스턴트', icon: MessageSquare },
    { path: '/files', label: '파일 업로드', icon: Upload },
    { path: '/reports', label: '보고서', icon: FileText },
    { path: '/budget', label: '예산 관리', icon: Wallet },
    ...(user?.role === 'ADMIN' ? [{ path: '/audit-log', label: '감사 로그', icon: ScrollText }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-30 bg-white/70 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex items-center min-w-0 flex-1">
              <div className="flex-shrink-0 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-extrabold text-sm shadow-sm shadow-blue-500/30">
                  자
                </div>
                <h1 className="text-lg font-bold text-gray-900 hidden sm:block whitespace-nowrap">
                  자산관리 시스템
                </h1>
              </div>
              <div className="hidden lg:flex ml-8 min-w-0 flex-1">
                <ScrollableNav items={menuItems} activePath={location.pathname} variant="desktop" />
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
          <div className="lg:hidden pb-2 -mx-1 px-1">
            <ScrollableNav items={menuItems} activePath={location.pathname} variant="mobile" />
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 px-4">
        <Outlet />
      </main>
    </div>
  );
}

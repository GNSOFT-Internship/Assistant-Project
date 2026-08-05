import React, { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import {
  LayoutDashboard, Package, Wrench, Lightbulb, MessageSquare,
  FileText, LogOut, Wallet, ChevronLeft, ChevronRight, ScrollText, Search, Keyboard, Sun, Moon
} from 'lucide-react';
import CommandPalette from './CommandPalette';
import ShortcutRecorderModal from './ShortcutRecorderModal';
import { loadShortcut, matchesShortcut, describeShortcut } from '../utils/shortcut';

const ONBOARDING_KEY = 'cmdk_onboarding_seen';

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
          className="absolute left-0 z-10 h-full px-1 flex items-center bg-gradient-to-r from-white via-white to-transparent dark:from-slate-800 dark:via-slate-800 dark:to-transparent"
        >
          <ChevronLeft size={16} className="text-gray-500 dark:text-slate-400" />
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
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 hover:dark:bg-slate-700 hover:text-slate-900 hover:dark:text-slate-100'
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
          className="absolute right-0 z-10 h-full px-1 flex items-center bg-gradient-to-l from-white via-white to-transparent dark:from-slate-800 dark:via-slate-800 dark:to-transparent"
        >
          <ChevronRight size={16} className="text-gray-500 dark:text-slate-400" />
        </button>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [shortcut, setShortcut] = useState(() => loadShortcut());
  const [showOnboarding, setShowOnboarding] = useState(
    () => typeof window !== 'undefined' && !localStorage.getItem(ONBOARDING_KEY)
  );
  const shortcutLabel = describeShortcut(shortcut);

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setShowOnboarding(false);
  };

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
    { path: '/reports', label: '보고서', icon: FileText },
    { path: '/budget', label: '예산 관리', icon: Wallet },
    ...(user?.role === 'ADMIN' ? [{ path: '/audit-log', label: '감사 로그', icon: ScrollText }] : []),
  ];

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (matchesShortcut(e, shortcut)) {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        dismissOnboarding();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcut]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <nav className="sticky top-0 z-30 bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border-b border-slate-100 dark:border-slate-700">
        <div className="max-w-7xl 2xl:max-w-[1680px] mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex items-center min-w-0 flex-1">
              <div className="flex-shrink-0 flex items-center gap-2">
                
                <img
                  src="/model.png"
                  alt="자산관리 로고"
                  className="w-[90px] h-[90px] object-contain dark:invert"
/>
                <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100 hidden sm:block whitespace-nowrap">
                  자산관리 시스템
                </h1>
              </div>
              <div className="hidden lg:flex ml-8 min-w-0 flex-1">
                <ScrollableNav items={menuItems} activePath={location.pathname} variant="desktop" />
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="relative hidden sm:flex items-center gap-1">
                <button
                  onClick={() => {
                    setPaletteOpen(true);
                    dismissOnboarding();
                  }}
                  title={`전역 검색 (${shortcutLabel})`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:bg-gray-50 hover:dark:bg-slate-900 hover:text-gray-700 hover:dark:text-slate-300 transition-colors"
                >
                  <Search size={14} />
                  <span>검색</span>
                  <kbd className="text-xs text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-600 rounded px-1">{shortcutLabel}</kbd>
                </button>
                <button
                  onClick={() => setRecorderOpen(true)}
                  title="검색 단축키 변경"
                  className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:bg-gray-100 hover:dark:bg-slate-700 hover:text-gray-600 hover:dark:text-slate-400 transition-colors"
                >
                  <Keyboard size={16} />
                </button>
                {showOnboarding && (
                  <div className="absolute top-full mt-2 right-0 z-40 w-64 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl">
                    <div className="absolute -top-1.5 right-6 w-3 h-3 bg-slate-800 rotate-45" />
                    <p className="mb-2 leading-relaxed">
                      💡 <strong>{shortcutLabel}</strong> 또는 이 검색 버튼으로 어디서든 빠르게 페이지 이동과 자산 검색을 할 수 있어요. 단축키는 옆의 키보드 아이콘으로 자유롭게 바꿀 수 있어요.
                    </p>
                    <button onClick={dismissOnboarding} className="text-blue-300 hover:text-blue-200 font-medium">
                      확인
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setPaletteOpen(true);
                  dismissOnboarding();
                }}
                title="전역 검색"
                className="sm:hidden p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 hover:dark:bg-slate-700 hover:text-gray-700 hover:dark:text-slate-300 transition-colors"
              >
                <Search size={18} />
              </button>
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-slate-400">
                  {user?.username?.[0]?.toUpperCase()}
                </div>
                <span>{user?.username}</span>
              </div>
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
                className="p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 hover:dark:bg-slate-700 hover:text-gray-700 hover:dark:text-slate-300 transition-colors"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                onClick={handleLogout}
                title="로그아웃"
                className="p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 hover:dark:bg-slate-700 hover:text-gray-700 hover:dark:text-slate-300 transition-colors"
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
      <main className="max-w-7xl 2xl:max-w-[1680px] mx-auto py-6 px-4">
        <Outlet />
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} navItems={menuItems} />
      <ShortcutRecorderModal
        open={recorderOpen}
        onClose={() => setRecorderOpen(false)}
        onSaved={(next) => setShortcut(next)}
      />
    </div>
  );
}

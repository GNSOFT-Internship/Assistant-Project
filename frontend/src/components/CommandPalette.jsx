import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { assetApi } from '../services/api';
import { AssetStatusBadge } from './StatusBadge';

export default function CommandPalette({ open, onClose, navItems }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setAssets([]);
      setActiveIndex(0);
      // 모달 오픈 애니메이션/렌더 이후 포커스가 확실히 먹도록 다음 틱에 포커스
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setAssets([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await assetApi.getAll({ page: 1, pageSize: 6, search: query.trim() });
        if (!cancelled) setAssets(response.data.data.items || []);
      } catch (error) {
        console.error('전역 검색 실패:', error);
        if (!cancelled) setAssets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const filteredNavItems = navItems.filter((item) =>
    query.trim() ? item.label.toLowerCase().includes(query.trim().toLowerCase()) : true
  );

  const results = [
    ...filteredNavItems.map((item) => ({ type: 'nav', ...item })),
    ...assets.map((asset) => ({ type: 'asset', ...asset })),
  ];

  const handleSelect = useCallback(
    (result) => {
      if (!result) return;
      if (result.type === 'nav') {
        navigate(result.path);
      } else {
        navigate(`/assets/${result.id}`);
      }
      onClose();
    },
    [navigate, onClose]
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-slate-100 dark:border-slate-700">
          <Search size={18} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="페이지 이동 또는 자산 검색..."
            className="flex-1 py-3.5 outline-none text-sm placeholder:text-slate-400 placeholder:dark:text-slate-500"
          />
          <kbd className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto py-2">
          {filteredNavItems.length > 0 && (
            <div>
              <div className="px-4 py-1 text-xs font-medium text-slate-400 dark:text-slate-500">페이지</div>
              {filteredNavItems.map((item) => {
                const globalIndex = results.findIndex((r) => r.type === 'nav' && r.path === item.path);
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleSelect({ type: 'nav', ...item })}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors ${
                      activeIndex === globalIndex ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 hover:dark:bg-slate-900'
                    }`}
                  >
                    <Icon size={16} className="flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    <ArrowRight size={14} className="text-slate-300 dark:text-slate-600" />
                  </button>
                );
              })}
            </div>
          )}

          {query.trim() && (
            <div>
              <div className="px-4 py-1 text-xs font-medium text-slate-400 dark:text-slate-500">
                자산{loading ? ' 검색 중...' : ''}
              </div>
              {!loading && assets.length === 0 && (
                <div className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500">일치하는 자산이 없습니다.</div>
              )}
              {assets.map((asset) => {
                const globalIndex = results.findIndex((r) => r.type === 'asset' && r.id === asset.id);
                return (
                  <button
                    key={asset.id}
                    onClick={() => handleSelect({ type: 'asset', ...asset })}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors ${
                      activeIndex === globalIndex ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 hover:dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{asset.assetName}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{asset.assetCode}</div>
                    </div>
                    <AssetStatusBadge status={asset.status} />
                  </button>
                );
              })}
            </div>
          )}

          {!query.trim() && (
            <div className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500">
              자산명이나 자산번호를 입력하면 바로 찾을 수 있습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

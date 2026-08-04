import React, { useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import {
  captureShortcut,
  describeShortcut,
  isModifierOnly,
  saveShortcut,
  clearShortcut,
  getDefaultShortcutLabel,
} from '../utils/shortcut';

export default function ShortcutRecorderModal({ open, onClose, onSaved }) {
  const [captured, setCaptured] = useState(null);

  useEffect(() => {
    if (!open) return;
    setCaptured(null);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (isModifierOnly(e)) return; // 조합키만 눌린 상태로는 대기, 실제 키가 눌릴 때까지 기다림
      e.preventDefault();
      setCaptured(captureShortcut(e));
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    if (!captured) return;
    saveShortcut(captured);
    onSaved(captured);
    onClose();
  };

  const handleReset = () => {
    clearShortcut();
    onSaved(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">전역 검색 단축키 변경</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 hover:dark:bg-slate-700 text-slate-400 dark:text-slate-500">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          원하는 키 조합을 눌러주세요. (예: Alt+/, Ctrl+Shift+F 등)
        </p>
        <div className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 mb-4">
          <span className="text-lg font-mono font-semibold text-blue-600">
            {captured ? describeShortcut(captured) : '키를 눌러주세요...'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:dark:text-slate-300 flex-shrink-0"
          >
            <RotateCcw size={13} /> 기본값({getDefaultShortcutLabel()})으로
          </button>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={onClose} className="btn btn-secondary text-sm px-3 py-1.5">
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!captured}
              className="btn btn-primary text-sm px-3 py-1.5 disabled:opacity-40"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

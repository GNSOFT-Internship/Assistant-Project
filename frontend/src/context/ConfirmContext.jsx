import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [prompt, setPrompt] = useState(null);
  const resolveRef = useRef(null);

  const confirmDialog = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPrompt({ message, ...options });
    });
  }, []);

  const settle = (result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setPrompt(null);
  };

  return (
    <ConfirmContext.Provider value={confirmDialog}>
      {children}
      {prompt && (
        <div
          className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4"
          onClick={() => settle(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line pt-1.5 leading-relaxed">{prompt.message}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => settle(false)} className="btn btn-secondary">
                {prompt.cancelLabel || '취소'}
              </button>
              <button
                onClick={() => settle(true)}
                className={prompt.danger ? 'btn btn-danger' : 'btn btn-primary'}
              >
                {prompt.confirmLabel || '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm은 ConfirmProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}

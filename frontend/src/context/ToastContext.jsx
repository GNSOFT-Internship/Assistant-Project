import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

let idCounter = 0;

const STYLES = {
  success: { icon: CheckCircle2, className: 'bg-green-50 border-green-200 text-green-800' },
  error: { icon: XCircle, className: 'bg-red-50 border-red-200 text-red-800' },
  info: { icon: Info, className: 'bg-blue-50 border-blue-200 text-blue-800' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type, message, duration = 4500) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, type, message }]);
      if (duration > 0) {
        setTimeout(() => remove(id), duration);
      }
    },
    [remove]
  );

  const toast = {
    success: (message, duration) => push('success', message, duration),
    error: (message, duration) => push('error', message, duration),
    info: (message, duration) => push('info', message, duration),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
        {toasts.map((t) => {
          const { icon: Icon, className } = STYLES[t.type] || STYLES.info;
          return (
            <div
              key={t.id}
              role="status"
              className={`flex items-start gap-2 border rounded-xl shadow-lg px-4 py-3 text-sm animate-toast-in ${className}`}
            >
              <Icon size={18} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1 whitespace-pre-line leading-relaxed">{t.message}</div>
              <button
                onClick={() => remove(t.id)}
                className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                aria-label="닫기"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast는 ToastProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}

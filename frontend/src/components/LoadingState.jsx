import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LoadingState({ label = '불러오는 중...', className = 'py-10' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-slate-500 ${className}`}>
      <Loader2 size={22} className="animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

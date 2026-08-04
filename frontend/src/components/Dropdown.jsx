import React from 'react';
import { ChevronDown } from 'lucide-react';

// 네이티브 <select>는 열림/닫힘을 OS가 그려서 트랜지션을 줄 수 없다.
// 버튼 + 절대 위치 패널로 직접 그려서 부드럽게 열고 닫히게 한다.
// (연/월 선택 등 여러 화면에서 공통으로 쓰는 드롭다운 — Reports/Budget 등에서 사용)
export default function Dropdown({ id, value, options, onChange, disabled, widthClass = 'w-20' }) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className={`relative ${widthClass}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-1 whitespace-nowrap rounded border px-2 py-1 text-sm transition-colors hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{selected?.label}</span>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`absolute left-0 top-full z-20 mt-1 max-h-56 w-full origin-top overflow-y-auto rounded-lg border bg-white py-1 shadow-lg transition-all duration-150 ease-out ${
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
        }`}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            onClick={() => {
              if (opt.disabled) return;
              onChange(opt.value);
              setOpen(false);
            }}
            className={`block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:text-gray-300 ${
              opt.value === value ? 'bg-blue-50 font-medium text-blue-600' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

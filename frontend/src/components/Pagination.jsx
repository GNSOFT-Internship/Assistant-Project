import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** "전체 N건 중 X-Y건" 요약 + 이전/다음 버튼. Assets/AssetDetail/Maintenance/
 * AuditLog 페이지에 거의 동일하게 반복되던 페이지네이션 UI를 하나로 모은 것.
 * 언제 렌더링할지(전체 개수가 페이지 크기보다 클 때만 등)는 호출부가 결정한다. */
export default function Pagination({ page, totalPages, total, pageSize, onChange, ariaLabel = '' }) {
  const prevLabel = ariaLabel ? `${ariaLabel} 이전 페이지` : '이전 페이지';
  const nextLabel = ariaLabel ? `${ariaLabel} 다음 페이지` : '다음 페이지';

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-slate-400">
      <div>
        전체 {total}건 중 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}건
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label={prevLabel}
          className="btn btn-secondary px-2 py-1 disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>
        <span>{page} / {totalPages}</span>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label={nextLabel}
          className="btn btn-secondary px-2 py-1 disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

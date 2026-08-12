import React from 'react';
import { Link } from 'react-router-dom';
import { AssetStatusBadge, MaintenanceTypeBadge } from './StatusBadge';
import LoadingState from './LoadingState';

/** 자산 상세 정보 + 유지보수 이력 요약. AiAssistant/Maintenance 페이지의 모달
 * 안에서 동일하게 쓰인다. onClose를 넘기면 제목 옆에 닫기 버튼이 함께 뜬다
 * (자체 헤더가 이미 있는 곳에서는 생략). */
export default function AssetDetailPreview({ asset, maintenance, loading, onClose }) {
  if (loading) return <LoadingState className="py-8" />;
  if (!asset) return null;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">{asset.assetName}</h2>
        <div className="flex items-center gap-2">
          <AssetStatusBadge status={asset.status} />
          {onClose && (
            <button onClick={onClose} className="btn btn-secondary">닫기</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <div className="text-gray-500 dark:text-slate-400">자산번호</div>
          <div className="font-medium">{asset.assetCode}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-slate-400">카테고리</div>
          <div className="font-medium">{asset.category}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-slate-400">위치</div>
          <div className="font-medium">{asset.location}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-slate-400">담당자</div>
          <div className="font-medium">{asset.responsiblePerson}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-slate-400">구매일</div>
          <div className="font-medium">{asset.purchaseDate?.split('T')[0]}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-slate-400">구매가</div>
          <div className="font-medium">{asset.purchasePrice?.toLocaleString()}원</div>
        </div>
      </div>

      <h3 className="font-semibold mb-2">유지보수 이력</h3>
      {maintenance.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-slate-400 py-6">유지보수 이력이 없습니다.</div>
      ) : (
        <div className="space-y-3 mb-4">
          {maintenance.map((record) => (
            <div key={record.id} className="border-l-4 border-blue-500 pl-3 py-1">
              <div className="flex justify-between items-start">
                <div>
                  <MaintenanceTypeBadge type={record.maintenanceType} />
                  <div className="text-sm text-gray-600 dark:text-slate-400 mt-1">{record.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{record.cost?.toLocaleString()}원</div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">{record.maintenanceDate?.split('T')[0]}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link to={`/assets/${asset.id}`} className="text-sm text-blue-600 hover:underline">
        자산 상세 페이지에서 전체 내용 보기 →
      </Link>
    </>
  );
}

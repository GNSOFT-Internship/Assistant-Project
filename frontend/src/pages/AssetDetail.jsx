import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { assetApi } from '../services/api';
import { Calendar, DollarSign, Clock, MapPin, User, Package, History } from 'lucide-react';
import { AssetStatusBadge, MaintenanceTypeBadge } from '../components/StatusBadge';

const FIELD_LABELS = {
  asset_name: '자산명',
  asset_code: '자산번호',
  category: '카테고리',
  location: '위치',
  responsible_person: '담당자',
  purchase_date: '구매일',
  purchase_price: '구매가',
  useful_life: '내용연수',
  status: '상태',
  description: '설명',
};

const ACTION_LABELS = {
  CREATE: { label: '등록', className: 'badge-green' },
  UPDATE: { label: '수정', className: 'badge-blue' },
  DELETE: { label: '삭제', className: 'badge-red' },
};

function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return '(없음)';
  if (field === 'purchase_price') return `${Number(value).toLocaleString()}원`;
  if (field === 'status') return value;
  return String(value);
}

export default function AssetDetail() {
  const { id } = useParams();
  const [asset, setAsset] = useState(null);
  const [maintenance, setMaintenance] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAsset();
    loadMaintenance();
    loadHistory();
  }, [id]);

  const loadAsset = async () => {
    try {
      const response = await assetApi.getById(id);
      setAsset(response.data.data);
    } catch (error) {
      console.error('자산 정보 로드 실패:', error);
    }
  };

  const loadMaintenance = async () => {
    try {
      const response = await assetApi.getMaintenanceHistory(id);
      setMaintenance(response.data.data);
    } catch (error) {
      console.error('유지보수 이력 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await assetApi.getHistory(id);
      setHistory(response.data.data || []);
    } catch (error) {
      console.error('변경 이력 로드 실패:', error);
    }
  };

  if (loading || !asset) return <div className="card">로딩 중...</div>;

  const usageYears = asset.purchaseDate ? 
    Math.floor((new Date() - new Date(asset.purchaseDate)) / (1000 * 60 * 60 * 24 * 365)) : 0;

  const totalMaintenanceCost = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Link to="/assets" className="btn btn-secondary">목록으로</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h1 className="text-2xl font-bold mb-4">{asset.assetName}</h1>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-500">자산번호</div>
              <div className="font-medium">{asset.assetCode}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">카테고리</div>
              <div className="font-medium">{asset.category}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">위치</div>
              <div className="font-medium">{asset.location}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">담당자</div>
              <div className="font-medium">{asset.responsiblePerson}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">구매일</div>
              <div className="font-medium">{asset.purchaseDate?.split('T')[0]}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">구매가</div>
              <div className="font-medium">{asset.purchasePrice?.toLocaleString()}원</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">내용연수</div>
              <div className="font-medium">{asset.usefulLife}년</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">상태</div>
              <AssetStatusBadge status={asset.status} />
            </div>
          </div>

          {asset.description && (
            <div className="border-t pt-4">
              <div className="text-sm text-gray-500 mb-1">설명</div>
              <div>{asset.description}</div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">요약</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Calendar className="text-blue-600" size={20} />
              <div>
                <div className="text-sm text-gray-500">사용기간</div>
                <div className="font-medium">{usageYears}년</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DollarSign className="text-green-600" size={20} />
              <div>
                <div className="text-sm text-gray-500">누적 수리비</div>
                <div className="font-medium">{totalMaintenanceCost.toLocaleString()}원</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="text-yellow-600" size={20} />
              <div>
                <div className="text-sm text-gray-500">잔여 내용연수</div>
                <div className="font-medium">{Math.max(0, asset.usefulLife - usageYears)}년</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Package className="text-purple-600" size={20} />
              <div>
                <div className="text-sm text-gray-500">유지보수 건수</div>
                <div className="font-medium">{maintenance.length}건</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">유지보수 이력</h3>
        
        {maintenance.length === 0 ? (
          <div className="text-center text-gray-500 py-8">유지보수 이력이 없습니다.</div>
        ) : (
          <div className="space-y-4">
            {maintenance.map((record, index) => (
              <div key={record.id} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex justify-between items-start">
                  <div>
                    <MaintenanceTypeBadge type={record.maintenanceType} />
                    <div className="text-sm text-gray-600 mt-1">{record.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{record.cost?.toLocaleString()}원</div>
                    <div className="text-sm text-gray-500">{record.maintenanceDate?.split('T')[0]}</div>
                  </div>
                </div>
                {record.technician && (
                  <div className="text-sm text-gray-500 mt-1">기술자: {record.technician}</div>
                )}
                {record.failureType && (
                  <div className="text-sm text-red-600 mt-1">고장유형: {record.failureType}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <History size={18} /> 변경 이력
        </h3>

        {history.length === 0 ? (
          <div className="text-center text-gray-500 py-8">변경 이력이 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => {
              const actionInfo = ACTION_LABELS[entry.action] || { label: entry.action, className: 'badge-gray' };
              const changedFields = entry.changes ? Object.keys(entry.changes) : [];
              return (
                <div key={entry.id} className="border-l-4 border-gray-300 pl-4 py-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className={actionInfo.className}>{actionInfo.label}</span>
                      <span className="text-sm text-gray-600">{entry.changedBy || '알 수 없음'}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleString('ko-KR') : ''}
                    </span>
                  </div>
                  {changedFields.length > 0 && (
                    <ul className="mt-2 text-sm text-gray-700 space-y-1">
                      {changedFields.map((field) => {
                        const change = entry.changes[field];
                        const label = FIELD_LABELS[field] || field;
                        return (
                          <li key={field}>
                            <span className="font-medium">{label}</span>:{' '}
                            {entry.action === 'CREATE' ? (
                              <span>{formatValue(field, change.new)}</span>
                            ) : entry.action === 'DELETE' ? (
                              <span>{formatValue(field, change.old)}</span>
                            ) : (
                              <span>
                                {formatValue(field, change.old)} → {formatValue(field, change.new)}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
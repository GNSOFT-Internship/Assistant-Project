import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { assetApi, aiApi } from '../services/api';
import { Calendar, DollarSign, Clock, MapPin, User, Package, History, Edit, Trash2 } from 'lucide-react';
import { AssetStatusBadge, MaintenanceTypeBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

const MAINTENANCE_TYPE_OPTIONS = [
  { value: 'ROUTINE', label: '정기점검' },
  { value: 'REPAIR', label: '수리' },
  { value: 'REPLACEMENT', label: '교체' },
  { value: 'INSPECTION', label: '점검' },
];

const EMPTY_RECORD_FORM = {
  maintenanceDate: '',
  maintenanceType: 'REPAIR',
  cost: '',
  description: '',
  technician: '',
  failureType: '',
};

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
  maintenance_record: '유지보수 기록',
  source: '출처',
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [asset, setAsset] = useState(null);
  const [maintenance, setMaintenance] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordForm, setRecordForm] = useState(EMPTY_RECORD_FORM);
  const [activeWorkOrder, setActiveWorkOrder] = useState(null);
  const [loadingWO, setLoadingWO] = useState(false);

  const handleViewWorkOrder = async (record) => {
    setLoadingWO(true);
    try {
      const response = await aiApi.getWorkOrder(record.id);
      setActiveWorkOrder(response.data);
    } catch (error) {
      console.error('AI 작업 지시서 로드 실패:', error);
      alert('AI 작업 지시서를 불러오거나 생성하는 데 실패했습니다.');
    } finally {
      setLoadingWO(false);
    }
  };

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
      setMaintenance(response.data.data?.items || []);
    } catch (error) {
      console.error('유지보수 이력 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await assetApi.getHistory(id);
      setHistory(response.data.data?.items || []);
    } catch (error) {
      console.error('변경 이력 로드 실패:', error);
    }
  };

  const handleEditRecord = (record) => {
    setEditingRecord(record);
    setRecordForm({
      maintenanceDate: record.maintenanceDate ? record.maintenanceDate.split('T')[0] : '',
      maintenanceType: record.maintenanceType || 'REPAIR',
      cost: record.cost ?? '',
      description: record.description || '',
      technician: record.technician || '',
      failureType: record.failureType || '',
    });
  };

  const closeRecordModal = () => {
    setEditingRecord(null);
    setRecordForm(EMPTY_RECORD_FORM);
  };

  const handleRecordSubmit = async (e) => {
    e.preventDefault();
    try {
      await assetApi.updateMaintenanceRecord(id, editingRecord.id, {
        maintenanceDate: recordForm.maintenanceDate,
        maintenanceType: recordForm.maintenanceType,
        cost: recordForm.cost === '' ? null : parseFloat(recordForm.cost),
        description: recordForm.description || null,
        technician: recordForm.technician || null,
        failureType: recordForm.failureType || null,
      });
      closeRecordModal();
      loadMaintenance();
    } catch (error) {
      console.error('유지보수 기록 수정 실패:', error);
      alert('수정 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteRecord = async (recordId) => {
    if (!confirm('이 유지보수 기록을 삭제하시겠습니까?')) return;
    try {
      await assetApi.deleteMaintenanceRecord(id, recordId);
      loadMaintenance();
    } catch (error) {
      console.error('유지보수 기록 삭제 실패:', error);
      alert('삭제 중 오류가 발생했습니다.');
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
                  <div className="text-right flex items-start gap-2">
                    <div>
                      <div className="font-medium">{record.cost?.toLocaleString()}원</div>
                      <div className="text-sm text-gray-500">{record.maintenanceDate?.split('T')[0]}</div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEditRecord(record)}
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
                          title="수정"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteRecord(record.id)}
                          className="p-1.5 hover:bg-red-100 rounded text-red-600"
                          title="삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed border-gray-100 flex-wrap gap-2">
                  <div className="flex gap-3 text-sm text-gray-500">
                    {record.technician && <span>기술자: {record.technician}</span>}
                    {record.technician && record.failureType && <span>|</span>}
                    {record.failureType && <span className="text-red-600 font-medium">고장유형: {record.failureType}</span>}
                  </div>
                  <button
                    onClick={() => handleViewWorkOrder(record)}
                    className="btn btn-secondary py-1 px-3 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border-none flex items-center gap-1"
                  >
                    AI 작업 지시서
                  </button>
                </div>
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

      {editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">유지보수 기록 수정</h2>
            <form onSubmit={handleRecordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">정비일</label>
                <input
                  type="date"
                  required
                  className="input"
                  value={recordForm.maintenanceDate}
                  onChange={(e) => setRecordForm({ ...recordForm, maintenanceDate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">정비유형</label>
                <select
                  className="input"
                  value={recordForm.maintenanceType}
                  onChange={(e) => setRecordForm({ ...recordForm, maintenanceType: e.target.value })}
                >
                  {MAINTENANCE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">비용 (원)</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={recordForm.cost}
                  onChange={(e) => setRecordForm({ ...recordForm, cost: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">설명</label>
                <input
                  type="text"
                  className="input"
                  value={recordForm.description}
                  onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">기술자</label>
                <input
                  type="text"
                  className="input"
                  value={recordForm.technician}
                  onChange={(e) => setRecordForm({ ...recordForm, technician: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">고장유형</label>
                <input
                  type="text"
                  className="input"
                  value={recordForm.failureType}
                  onChange={(e) => setRecordForm({ ...recordForm, failureType: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeRecordModal} className="btn btn-secondary">취소</button>
                <button type="submit" className="btn btn-primary">저장</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI 작업 지시서 모달 */}
      {activeWorkOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #print-work-order, #print-work-order * {
                visibility: visible;
              }
              #print-work-order {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: white !important;
                color: black !important;
              }
            }
          `}</style>
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto print:p-0 print:max-h-full print:shadow-none print:w-full">
            <div className="flex justify-between items-center mb-4 border-b pb-3 print:hidden">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                🔧 AI 유지보수 작업 지시서
              </h2>
              <button
                onClick={() => setActiveWorkOrder(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-semibold"
              >&times;</button>
            </div>

            <div id="print-work-order" className="space-y-6">
              <div className="text-center pb-4 border-b border-double border-gray-300">
                <h1 className="text-2xl font-bold text-gray-900">{activeWorkOrder.title}</h1>
                <p className="text-sm text-gray-500 mt-2">일련번호: WO-{activeWorkOrder.id} | 생성일시: {activeWorkOrder.createdAt ? new Date(activeWorkOrder.createdAt).toLocaleString('ko-KR') : '-'}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-sm text-gray-500 font-medium">대상 자산</div>
                  <div className="font-semibold text-gray-800">{asset?.assetName} ({asset?.assetCode})</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-sm text-gray-500 font-medium">예상 작업 시간</div>
                  <div className="font-semibold text-gray-800">{activeWorkOrder.estimatedTime || '미정'}</div>
                </div>
              </div>

              {activeWorkOrder.requiredTools && activeWorkOrder.requiredTools.length > 0 && (
                <div>
                  <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-1">🛠️ 필요 공구 및 자재</h3>
                  <div className="flex flex-wrap gap-2">
                    {activeWorkOrder.requiredTools.map((tool, idx) => (
                      <span key={idx} className="bg-gray-100 text-gray-800 text-xs px-2.5 py-1 rounded font-medium">{tool}</span>
                    ))}
                  </div>
                </div>
              )}

              {activeWorkOrder.safetyPrecautions && activeWorkOrder.safetyPrecautions.length > 0 && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r">
                  <h3 className="font-bold text-red-800 mb-2 flex items-center gap-1">⚠️ 필수 안전 주의사항</h3>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                    {activeWorkOrder.safetyPrecautions.map((prec, idx) => (
                      <li key={idx}>{prec}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-1">📋 단계별 표준 조치 절차</h3>
                <ol className="space-y-3">
                  {activeWorkOrder.steps.map((step, idx) => (
                    <li key={idx} className="flex gap-3 text-sm text-gray-800 items-start">
                      <span className="flex items-center justify-center bg-blue-100 text-blue-800 font-bold rounded-full w-5 h-5 text-xs flex-shrink-0 mt-0.5">{idx + 1}</span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn btn-primary"
              >
                인쇄하기
              </button>
              <button type="button" onClick={() => setActiveWorkOrder(null)} className="btn btn-secondary">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 로딩 인디케이터 */}
      {loadingWO && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow-lg flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-sm font-medium">AI 작업 지시서 생성 중...</span>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { assetApi, aiApi } from '../services/api';
import { Calendar, DollarSign, Clock, Package, History, Edit, Trash2, FileText, Send, MessageSquare, Loader, ChevronLeft, ChevronRight } from 'lucide-react';
import { AssetStatusBadge, MaintenanceTypeBadge } from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import Modal from '../components/Modal';
import ProcurementSpecModal, { useProcurementSpecModal } from '../components/ProcurementSpecModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

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

const HISTORY_PAGE_SIZE = 20;

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
  const toast = useToast();
  const confirmDialog = useConfirm();
  const isAdmin = user?.role === 'ADMIN';
  const [asset, setAsset] = useState(null);
  const [maintenance, setMaintenance] = useState([]);
  // "누적 수리비"/"유지보수 건수"는 maintenance 목록(최대 200건 페이지)이 아니라
  // 서버가 전체 기록 기준으로 집계해 내려주는 값을 그대로 쓴다 — 그래야 한 자산의
  // 유지보수 기록이 페이지 크기를 넘어도 합계가 조용히 줄어들지 않는다.
  const [maintenanceTotal, setMaintenanceTotal] = useState(0);
  const [maintenanceTotalCost, setMaintenanceTotalCost] = useState(0);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenancePage, setMaintenancePage] = useState(1);
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordForm, setRecordForm] = useState(EMPTY_RECORD_FORM);
  const [activeWorkOrder, setActiveWorkOrder] = useState(null);
  const [loadingWO, setLoadingWO] = useState(false);

  // 조달 사양서 생성 관련 상태
  const specModal = useProcurementSpecModal();

  // AI 고장 진단 Q&A 챗봇 관련 상태
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const chatContainerRef = useRef(null);

  // 자산 로드 시 챗봇 첫 환영 메시지 초기화
  useEffect(() => {
    if (asset) {
      setChatHistory([
        {
          role: 'assistant',
          content: `안녕하세요! ${asset.assetName} (${asset.assetCode}) 고장 자가 진단 AI 지원 챗봇입니다.
현재 기기에 발생한 고장 증상(예: "작동 중 갑자기 멈춤", "화면에 에러코드 E-02가 뜸")을 입력해 주시면, 과거 수리 이력을 바탕으로 정밀 진단과 해결 가이드를 제안해 드립니다.`
        }
      ]);
    }
  }, [asset]);

  // 대화 추가 시 자동 스크롤 (사용자가 위로 스크롤해서 이전 대화를 보는 중이면 방해하지 않도록,
  // 채팅창 자체 스크롤만 조정하고 이미 하단 근처일 때만 내린다)
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 100) {
      container.scrollTop = container.scrollHeight;
    }
  }, [chatHistory]);

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || loadingChat) return;

    const userMessage = { role: 'user', content: chatInput };
    const updatedHistory = [...chatHistory, userMessage];
    setChatHistory(updatedHistory);
    setChatInput('');
    setLoadingChat(true);

    setChatHistory([...updatedHistory, { role: 'assistant', content: '' }]);

    try {
      await aiApi.streamDiagnose(asset.id, updatedHistory, (_chunk, fullTextSoFar) => {
        setChatHistory([...updatedHistory, { role: 'assistant', content: fullTextSoFar }]);
      });
    } catch (error) {
      console.error('고장 진단 실패:', error);
      setChatHistory([...updatedHistory, { role: 'assistant', content: '죄송합니다. 고장 진단을 연동하는 중 오류가 발생했습니다.' }]);
    } finally {
      setLoadingChat(false);
    }
  };

  const handleViewWorkOrder = async (record) => {
    setLoadingWO(true);
    try {
      const response = await aiApi.getWorkOrder(record.id);
      setActiveWorkOrder(response.data);
    } catch (error) {
      console.error('AI 작업 지시서 로드 실패:', error);
      toast.error('AI 작업 지시서를 불러오거나 생성하는 데 실패했습니다.');
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

  const loadMaintenance = async (page = 1) => {
    try {
      const response = await assetApi.getMaintenanceHistory(id, { page, pageSize: HISTORY_PAGE_SIZE });
      const data = response.data.data || {};
      setMaintenance(data.items || []);
      setMaintenanceTotal(data.total || 0);
      setMaintenanceTotalCost(data.totalCost || 0);
      setMaintenancePage(data.page || page);
    } catch (error) {
      console.error('유지보수 이력 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (page = 1) => {
    try {
      const response = await assetApi.getHistory(id, { page, pageSize: HISTORY_PAGE_SIZE });
      const data = response.data.data || {};
      setHistory(data.items || []);
      setHistoryTotal(data.total || 0);
      setHistoryPage(data.page || page);
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
      loadMaintenance(maintenancePage);
    } catch (error) {
      console.error('유지보수 기록 수정 실패:', error);
      toast.error('수정 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteRecord = async (recordId) => {
    if (!(await confirmDialog('이 유지보수 기록을 삭제하시겠습니까?', { danger: true, confirmLabel: '삭제' }))) return;
    try {
      await assetApi.deleteMaintenanceRecord(id, recordId);
      loadMaintenance(maintenancePage);
    } catch (error) {
      console.error('유지보수 기록 삭제 실패:', error);
      toast.error('삭제 중 오류가 발생했습니다.');
    }
  };

  if (loading || !asset) return <div className="card"><LoadingState /></div>;

  const usageYears = asset.purchaseDate ? 
    Math.floor((new Date() - new Date(asset.purchaseDate)) / (1000 * 60 * 60 * 24 * 365)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Link to="/assets" className="btn btn-secondary">목록으로</Link>
        <div className="flex gap-2">
          <button
            onClick={() => setMaintenanceOpen(true)}
            className="btn btn-secondary flex items-center gap-1.5"
          >
            <Clock size={16} /> 유지보수 이력
          </button>
          <button
            onClick={() => setHistoryOpen(true)}
            className="btn btn-secondary flex items-center gap-1.5"
          >
            <History size={16} /> 변경 이력
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 border-b border-slate-100 dark:border-slate-700 pb-3">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">{asset.assetName}</h1>
            <button
              onClick={() => specModal.generate(asset.id)}
              className="btn btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-md shadow-blue-500/20"
            >
              <FileText size={14} />
              AI 조달 규격서/RFP 생성
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-500 dark:text-slate-400">자산번호</div>
              <div className="font-medium">{asset.assetCode}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-slate-400">카테고리</div>
              <div className="font-medium">{asset.category}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-slate-400">위치</div>
              <div className="font-medium">{asset.location}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-slate-400">담당자</div>
              <div className="font-medium">{asset.responsiblePerson}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-slate-400">구매일</div>
              <div className="font-medium">{asset.purchaseDate?.split('T')[0]}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-slate-400">구매가</div>
              <div className="font-medium">{asset.purchasePrice?.toLocaleString()}원</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-slate-400">내용연수</div>
              <div className="font-medium">{asset.usefulLife}년</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">상태</div>
              <AssetStatusBadge status={asset.status} />
            </div>
          </div>

          {asset.description && (
            <div className="border-t pt-4">
              <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">설명</div>
              <div>{asset.description}</div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <h3 className="font-semibold mb-4">요약</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="text-blue-600" size={20} />
                <div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">사용기간</div>
                  <div className="font-medium">{usageYears}년</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <DollarSign className="text-green-600" size={20} />
                <div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">누적 수리비</div>
                  <div className="font-medium">{maintenanceTotalCost.toLocaleString()}원</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="text-yellow-600" size={20} />
                <div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">잔여 내용연수</div>
                  <div className="font-medium">{Math.max(0, asset.usefulLife - usageYears)}년</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Package className="text-purple-600" size={20} />
                <div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">유지보수 건수</div>
                  <div className="font-medium">{maintenanceTotal}건</div>
                </div>
              </div>
            </div>
          </div>

          {/* AI 고장 자가 진단 챗봇 카드 */}
          <div className="card flex flex-col h-[420px] p-4 space-y-3">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
              <MessageSquare className="text-blue-600 animate-pulse" size={18} />
              AI 고장 진단 챗봇
            </h3>

            {/* Chat Messages Log */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs scrollbar-hide">
              {chatHistory.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mb-0.5">
                    {msg.role === 'user' ? '나' : 'AI 엔지니어'}
                  </span>
                  <div
                    className={`p-3 rounded-2xl max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-sm shadow-blue-500/10'
                        : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-700 rounded-tl-none'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loadingChat && !chatHistory[chatHistory.length - 1]?.content && (
                <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 pl-1">
                  <Loader className="animate-spin" size={12} />
                  <span>진단 답변 생각 중...</span>
                </div>
              )}
            </div>

            {/* Chat Input Field */}
            <form onSubmit={handleSendChat} className="flex gap-1.5 border-t border-slate-100 dark:border-slate-700 pt-2 flex-shrink-0">
              <input
                type="text"
                required
                placeholder="고장 증상을 입력하세요..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={loadingChat}
                className="input py-2 text-xs flex-1 rounded-lg border-slate-200 dark:border-slate-600"
              />
              <button
                type="submit"
                disabled={loadingChat || !chatInput.trim()}
                className="btn btn-primary p-2 w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-lg shadow-sm shadow-blue-500/10"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>

      <Modal open={maintenanceOpen} onClose={() => setMaintenanceOpen(false)} maxWidth="max-w-3xl">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-700 pb-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock size={18} /> 유지보수 이력 ({maintenanceTotal}건)
          </h3>
          <button onClick={() => setMaintenanceOpen(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:dark:text-slate-400 font-bold">
            닫기
          </button>
        </div>

        {(maintenance.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-slate-400 py-8">유지보수 이력이 없습니다.</div>
        ) : (
          <div className="space-y-4">
            {maintenance.map((record) => (
              <div key={record.id} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex justify-between items-start">
                  <div>
                    <MaintenanceTypeBadge type={record.maintenanceType} />
                    <div className="text-sm text-gray-600 dark:text-slate-400 mt-1">{record.description}</div>
                  </div>
                  <div className="text-right flex items-start gap-2">
                    <div>
                      <div className="font-medium">{record.cost?.toLocaleString()}원</div>
                      <div className="text-sm text-gray-500 dark:text-slate-400">{record.maintenanceDate?.split('T')[0]}</div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEditRecord(record)}
                          className="p-1.5 hover:bg-gray-100 hover:dark:bg-slate-700 rounded text-gray-500 dark:text-slate-400"
                          title="수정"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteRecord(record.id)}
                          className="p-1.5 hover:bg-red-100 hover:dark:bg-red-500/15 rounded text-red-600"
                          title="삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed border-gray-100 dark:border-slate-700 flex-wrap gap-2">
                  <div className="flex gap-3 text-sm text-gray-500 dark:text-slate-400">
                    {record.technician && <span>기술자: {record.technician}</span>}
                    {record.technician && record.failureType && <span>|</span>}
                    {record.failureType && <span className="text-red-600 font-medium">고장유형: {record.failureType}</span>}
                  </div>
                  <button
                    onClick={() => handleViewWorkOrder(record)}
                    className="btn btn-secondary py-1 px-3 text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-700 hover:bg-blue-100 hover:dark:bg-blue-500/15 border-none flex items-center gap-1"
                  >
                    AI 작업 지시서
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {maintenanceTotal > HISTORY_PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-slate-400">
            <div>
              전체 {maintenanceTotal}건 중 {(maintenancePage - 1) * HISTORY_PAGE_SIZE + 1}-
              {Math.min(maintenancePage * HISTORY_PAGE_SIZE, maintenanceTotal)}건
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadMaintenance(maintenancePage - 1)}
                disabled={maintenancePage <= 1}
                className="btn btn-secondary px-2 py-1 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span>{maintenancePage} / {Math.max(1, Math.ceil(maintenanceTotal / HISTORY_PAGE_SIZE))}</span>
              <button
                onClick={() => loadMaintenance(maintenancePage + 1)}
                disabled={maintenancePage >= Math.ceil(maintenanceTotal / HISTORY_PAGE_SIZE)}
                className="btn btn-secondary px-2 py-1 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="max-w-3xl">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-700 pb-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <History size={18} /> 변경 이력 ({historyTotal}건)
          </h3>
          <button onClick={() => setHistoryOpen(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:dark:text-slate-400 font-bold">
            닫기
          </button>
        </div>

        {(history.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-slate-400 py-8">변경 이력이 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => {
              const actionInfo = ACTION_LABELS[entry.action] || { label: entry.action, className: 'badge-gray' };
              const changedFields = entry.changes ? Object.keys(entry.changes) : [];
              return (
                <div key={entry.id} className="border-l-4 border-gray-300 dark:border-slate-600 pl-4 py-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className={actionInfo.className}>{actionInfo.label}</span>
                      <span className="text-sm text-gray-600 dark:text-slate-400">{entry.changedBy || '알 수 없음'}</span>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-slate-400">
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleString('ko-KR') : ''}
                    </span>
                  </div>
                  {changedFields.length > 0 && (
                    <ul className="mt-2 text-sm text-gray-700 dark:text-slate-300 space-y-1">
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
        ))}

        {historyTotal > HISTORY_PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-slate-400">
            <div>
              전체 {historyTotal}건 중 {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}-
              {Math.min(historyPage * HISTORY_PAGE_SIZE, historyTotal)}건
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadHistory(historyPage - 1)}
                disabled={historyPage <= 1}
                className="btn btn-secondary px-2 py-1 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span>{historyPage} / {Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE))}</span>
              <button
                onClick={() => loadHistory(historyPage + 1)}
                disabled={historyPage >= Math.ceil(historyTotal / HISTORY_PAGE_SIZE)}
                className="btn btn-secondary px-2 py-1 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!editingRecord} onClose={closeRecordModal}>
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
      </Modal>

      {/* AI 작업 지시서 모달 */}
      <Modal open={!!activeWorkOrder} onClose={() => setActiveWorkOrder(null)} maxWidth="max-w-2xl">
        {activeWorkOrder && (
          <>
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
            <div className="flex justify-between items-center mb-4 border-b pb-3 print:hidden">
              <h2 className="text-xl font-bold text-gray-800 dark:text-slate-200 flex items-center gap-2">
                🔧 AI 유지보수 작업 지시서
              </h2>
              <button
                onClick={() => setActiveWorkOrder(null)}
                className="text-gray-500 dark:text-slate-400 hover:text-gray-700 hover:dark:text-slate-300 text-2xl font-semibold"
              >&times;</button>
            </div>

            <div id="print-work-order" className="space-y-6">
              <div className="text-center pb-4 border-b border-double border-gray-300 dark:border-slate-600">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{activeWorkOrder.title}</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">일련번호: WO-{activeWorkOrder.id} | 생성일시: {activeWorkOrder.createdAt ? new Date(activeWorkOrder.createdAt).toLocaleString('ko-KR') : '-'}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                  <div className="text-sm text-gray-500 dark:text-slate-400 font-medium">대상 자산</div>
                  <div className="font-semibold text-gray-800 dark:text-slate-200">{asset?.assetName} ({asset?.assetCode})</div>
                </div>
                <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded">
                  <div className="text-sm text-gray-500 dark:text-slate-400 font-medium">예상 작업 시간</div>
                  <div className="font-semibold text-gray-800 dark:text-slate-200">{activeWorkOrder.estimatedTime || '미정'}</div>
                </div>
              </div>

              {activeWorkOrder.requiredTools && activeWorkOrder.requiredTools.length > 0 && (
                <div>
                  <h3 className="font-bold text-gray-700 dark:text-slate-300 mb-2 flex items-center gap-1">🛠️ 필요 공구 및 자재</h3>
                  <div className="flex flex-wrap gap-2">
                    {activeWorkOrder.requiredTools.map((tool, idx) => (
                      <span key={idx} className="bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-200 text-xs px-2.5 py-1 rounded font-medium">{tool}</span>
                    ))}
                  </div>
                </div>
              )}

              {activeWorkOrder.safetyPrecautions && activeWorkOrder.safetyPrecautions.length > 0 && (
                <div className="bg-red-50 dark:bg-red-500/10 border-l-4 border-red-500 p-4 rounded-r">
                  <h3 className="font-bold text-red-800 dark:text-red-300 mb-2 flex items-center gap-1">⚠️ 필수 안전 주의사항</h3>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                    {activeWorkOrder.safetyPrecautions.map((prec, idx) => (
                      <li key={idx}>{prec}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="font-bold text-gray-700 dark:text-slate-300 mb-2 flex items-center gap-1">📋 단계별 표준 조치 절차</h3>
                <ol className="space-y-3">
                  {activeWorkOrder.steps.map((step, idx) => (
                    <li key={idx} className="flex gap-3 text-sm text-gray-800 dark:text-slate-200 items-start">
                      <span className="flex items-center justify-center bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300 font-bold rounded-full w-5 h-5 text-xs flex-shrink-0 mt-0.5">{idx + 1}</span>
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
          </>
        )}
      </Modal>

      {/* 로딩 인디케이터 */}
      {loadingWO && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 p-4 rounded shadow-lg flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-sm font-medium">AI 작업 지시서 생성 중...</span>
          </div>
        </div>
      )}

      <ProcurementSpecModal
        open={specModal.open}
        onClose={specModal.close}
        loading={specModal.loading}
        specData={specModal.specData}
        downloading={specModal.downloading}
        onDownload={specModal.download}
      />
    </div>
  );
}
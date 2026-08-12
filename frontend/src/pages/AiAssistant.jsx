import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Trash2 } from 'lucide-react';
import { aiApi, assetApi, chatApi } from '../services/api';
import { AssetStatusBadge } from '../components/StatusBadge';
import Modal from '../components/Modal';
import AssetDetailPreview from '../components/AssetDetailPreview';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

export default function AiAssistant() {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [viewingAsset, setViewingAsset] = useState(null);
  const [viewingMaintenance, setViewingMaintenance] = useState([]);
  const [loadingAssetDetail, setLoadingAssetDetail] = useState(false);
  const messagesContainerRef = useRef(null);
  const hasScrolledToInitialBottomRef = useRef(false);

  // 사용자가 위로 스크롤해서 이전 대화를 보는 중이면 방해하지 않도록,
  // 메시지창 자체 스크롤만 조정하고 이미 하단 근처일 때만 내린다
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (!hasScrolledToInitialBottomRef.current) {
      // 새 탭/새로고침 직후 대화 기록을 불러왔을 때는 항상 맨 아래(가장 최근 메시지)로
      // 이동한다. 스크롤이 기본값(맨 위)에 있어 "이미 하단 근처"일 때만 내리는 아래 로직만
      // 쓰면 첫 로드 시에는 절대 조건을 만족하지 못해 맨 위에 그대로 머무르는 문제가 있었다.
      if (loadingHistory) return;
      container.scrollTop = container.scrollHeight;
      hasScrolledToInitialBottomRef.current = true;
      return;
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 100) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, loadingHistory]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await chatApi.getHistory();
        const history = (res.data.data || []).map((m) => ({
          type: m.role === 'USER' ? 'user' : 'ai',
          content: m.content,
          assets: m.assets || [],
        }));
        setMessages(history);
      } catch (error) {
        console.error('대화 기록 로드 실패:', error);
      } finally {
        setLoadingHistory(false);
      }
    };
    loadHistory();
  }, []);

  const handleClearHistory = async () => {
    if (!(await confirmDialog('대화 기록을 모두 삭제하시겠습니까?', { danger: true, confirmLabel: '삭제' }))) return;
    try {
      await chatApi.clearHistory();
      setMessages([]);
    } catch (error) {
      console.error('대화 기록 삭제 실패:', error);
      toast.error('대화 기록 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleAssetClick = async (assetId) => {
    setViewingAsset({});
    setLoadingAssetDetail(true);
    try {
      const [assetRes, maintenanceRes] = await Promise.all([
        assetApi.getById(assetId),
        assetApi.getMaintenanceHistory(assetId),
      ]);
      setViewingAsset(assetRes.data.data);
      setViewingMaintenance(maintenanceRes.data.data?.items || []);
    } catch (error) {
      console.error('자산 상세 로드 실패:', error);
    } finally {
      setLoadingAssetDetail(false);
    }
  };

  const closeAssetModal = () => {
    setViewingAsset(null);
    setViewingMaintenance([]);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input;
    setMessages((prev) => [...prev, { type: 'user', content: question }]);
    setInput('');
    setLoading(true);

    try {
      const qaRes = await aiApi.askQuestion(question);
      const data = qaRes.data.data;
      setMessages((prev) => [...prev, {
        type: 'ai',
        content: data.answer,
        assets: data.hasFilter ? (data.assets || []) : [],
      }]);
    } catch (error) {
      console.error('질문 실패:', error);
      setMessages((prev) => [...prev, {
        type: 'ai',
        content: '답변하는 중 오류가 발생했습니다. 다시 시도해주세요.',
        assets: [],
      }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestedQuestions = [
    '총 자산 수는 얼마인가요?',
    '3년 이상 사용한 노트북 보여줘',
    '교체가 필요한 자산이 있나요?',
    '100만원 이상인 IT 장비 찾기',
  ];

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-start justify-between gap-2 mb-4">
          <h1 className="text-2xl font-bold">AI 어시스턴트</h1>
          {messages.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="btn btn-secondary flex items-center gap-1 text-sm flex-shrink-0"
            >
              <Trash2 size={14} /> 대화 초기화
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
          자산 현황을 질문하거나, 조건에 맞는 자산을 자연어로 찾아보세요. 필요하면 관련 자산 목록도 함께 보여드립니다.
          대화 내용은 계정에 저장되어 다른 페이지에 다녀와도 이어집니다.
        </p>

        <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 mb-4">
          <div className="text-sm text-gray-600 dark:text-slate-400 mb-2">추천 질문:</div>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => setInput(q)}
                className="text-sm px-3 py-1 bg-white dark:bg-slate-800 border rounded hover:bg-gray-100 hover:dark:bg-slate-700"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div ref={messagesContainerRef} className="border rounded-lg h-[28rem] overflow-y-auto p-4 bg-white dark:bg-slate-800 space-y-4">
          {loadingHistory ? (
            <div className="h-full flex items-center justify-center text-gray-500 dark:text-slate-400">
              대화 기록을 불러오는 중...
            </div>
          ) : messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-gray-500 dark:text-slate-400">
              질문을 입력하세요.
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : ''}`}>
              {msg.type === 'ai' && (
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/15 rounded-full flex items-center justify-center mr-2 flex-shrink-0">
                  <Bot size={16} className="text-blue-600" />
                </div>
              )}
              <div className={msg.type === 'user' ? 'max-w-[80%]' : 'max-w-[85%] flex-1'}>
                <div className={`rounded-lg p-3 w-fit ${
                  msg.type === 'user' ? 'bg-blue-600 text-white ml-auto' : 'bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-200'
                }`}>
                  <div className="whitespace-pre-line">{msg.content}</div>
                </div>

                {msg.type === 'ai' && msg.assets?.length > 0 && (
                  <div className="mt-2 border rounded-lg overflow-x-auto">
                    <table className="table">
                      <thead className="table-header">
                        <tr>
                          <th className="table-cell">자산명</th>
                          <th className="table-cell">자산번호</th>
                          <th className="table-cell">카테고리</th>
                          <th className="table-cell">상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {msg.assets.map((asset) => (
                          <tr
                            key={asset.id}
                            role="button"
                            tabIndex={0}
                            className="border-t cursor-pointer hover:bg-gray-50 hover:dark:bg-slate-900"
                            onClick={() => handleAssetClick(asset.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleAssetClick(asset.id);
                              }
                            }}
                          >
                            <td className="table-cell font-medium">{asset.assetName}</td>
                            <td className="table-cell">{asset.assetCode}</td>
                            <td className="table-cell">{asset.category}</td>
                            <td className="table-cell"><AssetStatusBadge status={asset.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {msg.type === 'user' && (
                <div className="w-8 h-8 bg-gray-200 dark:bg-slate-700 rounded-full flex items-center justify-center ml-2 flex-shrink-0">
                  <User size={16} className="text-gray-600 dark:text-slate-400" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/15 rounded-full flex items-center justify-center mr-2">
                <Bot size={16} className="text-blue-600" />
              </div>
              <div className="bg-gray-100 dark:bg-slate-700 rounded-lg p-3">
                답변 중...
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="flex gap-2 mt-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="질문하거나 찾고 싶은 자산을 입력하세요..."
            disabled={loading}
            className="input flex-1"
          />
          <button type="submit" disabled={loading || !input.trim()} className="btn btn-primary flex items-center gap-2">
            <Send size={16} /> 전송
          </button>
        </form>
      </div>

      <Modal open={!!viewingAsset} onClose={closeAssetModal} maxWidth="max-w-2xl">
        <AssetDetailPreview
          asset={viewingAsset}
          maintenance={viewingMaintenance}
          loading={loadingAssetDetail}
          onClose={closeAssetModal}
        />
      </Modal>
    </div>
  );
}

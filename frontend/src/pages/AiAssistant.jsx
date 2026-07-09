import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Send, Bot, User } from 'lucide-react';
import { aiApi, assetApi } from '../services/api';
import { AssetStatusBadge, MaintenanceTypeBadge } from '../components/StatusBadge';

export default function AiAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewingAsset, setViewingAsset] = useState(null);
  const [viewingMaintenance, setViewingMaintenance] = useState([]);
  const [loadingAssetDetail, setLoadingAssetDetail] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleAssetClick = async (assetId) => {
    setViewingAsset({});
    setLoadingAssetDetail(true);
    try {
      const [assetRes, maintenanceRes] = await Promise.all([
        assetApi.getById(assetId),
        assetApi.getMaintenanceHistory(assetId),
      ]);
      setViewingAsset(assetRes.data.data);
      setViewingMaintenance(maintenanceRes.data.data || []);
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
    if (!input.trim()) return;

    const question = input;
    setMessages((prev) => [...prev, { type: 'user', content: question }]);
    setInput('');
    setLoading(true);

    try {
      const [qaRes, searchRes] = await Promise.all([
        aiApi.askQuestion(question),
        aiApi.naturalLanguageSearch(question),
      ]);
      const searchData = searchRes.data.data;
      setMessages((prev) => [...prev, {
        type: 'ai',
        content: qaRes.data.data.answer,
        assets: searchData?.hasFilter ? (searchData.assets || []) : [],
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
        <h1 className="text-2xl font-bold mb-4">AI 어시스턴트</h1>
        <p className="text-sm text-gray-500 mb-4">
          자산 현황을 질문하거나, 조건에 맞는 자산을 자연어로 찾아보세요. 필요하면 관련 자산 목록도 함께 보여드립니다.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="text-sm text-gray-600 mb-2">추천 질문:</div>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => setInput(q)}
                className="text-sm px-3 py-1 bg-white border rounded hover:bg-gray-100"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="border rounded-lg h-[28rem] overflow-y-auto p-4 bg-white space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-gray-500">
              질문을 입력하세요.
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : ''}`}>
              {msg.type === 'ai' && (
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2 flex-shrink-0">
                  <Bot size={16} className="text-blue-600" />
                </div>
              )}
              <div className={msg.type === 'user' ? 'max-w-[80%]' : 'max-w-[85%] flex-1'}>
                <div className={`rounded-lg p-3 w-fit ${
                  msg.type === 'user' ? 'bg-blue-600 text-white ml-auto' : 'bg-gray-100 text-gray-800'
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
                            className="border-t cursor-pointer hover:bg-gray-50"
                            onClick={() => handleAssetClick(asset.id)}
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
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center ml-2 flex-shrink-0">
                  <User size={16} className="text-gray-600" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2">
                <Bot size={16} className="text-blue-600" />
              </div>
              <div className="bg-gray-100 rounded-lg p-3">
                답변 중...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="flex gap-2 mt-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="질문하거나 찾고 싶은 자산을 입력하세요..."
            className="input flex-1"
          />
          <button type="submit" className="btn btn-primary flex items-center gap-2">
            <Send size={16} /> 전송
          </button>
        </form>
      </div>

      {viewingAsset && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={closeAssetModal}
        >
          <div
            className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {loadingAssetDetail ? (
              <div className="text-center text-gray-500 py-8">로딩 중...</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">{viewingAsset.assetName}</h2>
                  <div className="flex items-center gap-2">
                    <AssetStatusBadge status={viewingAsset.status} />
                    <button onClick={closeAssetModal} className="btn btn-secondary">닫기</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div>
                    <div className="text-gray-500">자산번호</div>
                    <div className="font-medium">{viewingAsset.assetCode}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">카테고리</div>
                    <div className="font-medium">{viewingAsset.category}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">위치</div>
                    <div className="font-medium">{viewingAsset.location}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">담당자</div>
                    <div className="font-medium">{viewingAsset.responsiblePerson}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">구매일</div>
                    <div className="font-medium">{viewingAsset.purchaseDate?.split('T')[0]}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">구매가</div>
                    <div className="font-medium">{viewingAsset.purchasePrice?.toLocaleString()}원</div>
                  </div>
                </div>

                <h3 className="font-semibold mb-2">유지보수 이력</h3>
                {viewingMaintenance.length === 0 ? (
                  <div className="text-center text-gray-500 py-6">유지보수 이력이 없습니다.</div>
                ) : (
                  <div className="space-y-3 mb-4">
                    {viewingMaintenance.map((record) => (
                      <div key={record.id} className="border-l-4 border-blue-500 pl-3 py-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <MaintenanceTypeBadge type={record.maintenanceType} />
                            <div className="text-sm text-gray-600 mt-1">{record.description}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{record.cost?.toLocaleString()}원</div>
                            <div className="text-xs text-gray-500">{record.maintenanceDate?.split('T')[0]}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Link to={`/assets/${viewingAsset.id}`} className="text-sm text-blue-600 hover:underline">
                  자산 상세 페이지에서 전체 내용 보기 →
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

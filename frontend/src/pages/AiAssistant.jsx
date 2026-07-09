import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Bot, User } from 'lucide-react';
import { aiApi } from '../services/api';
import { AssetStatusBadge } from '../components/StatusBadge';

export default function AiAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
                            onClick={() => navigate(`/assets/${asset.id}`)}
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
    </div>
  );
}

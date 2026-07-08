import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot } from 'lucide-react';
import { mockQAResponses } from '../utils/dummyData';

export default function QnA() {
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

  const getDummyResponse = (question) => {
    const questionLower = question.toLowerCase();
    
    for (const [key, response] of Object.entries(mockQAResponses.questions)) {
      if (questionLower.includes(key)) {
        return response;
      }
    }
    
    return mockQAResponses.default;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { type: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // TODO: 실제 AI API 연결 시 아래 코드를 해제하고 실제 API 호출로 교체
    // try {
    //   const response = await api.post('/api/qa/ask', { question: input });
    //   const aiMessage = { 
    //     type: 'ai', 
    //     content: response.data.data.answer 
    //   };
    //   setMessages(prev => [...prev, aiMessage]);
    // } catch (error) {
    //   console.error('질문 실패:', error);
    //   setMessages(prev => [...prev, { 
    //     type: 'ai', 
    //     content: '질문에 답변하는 중 오류가 발생했습니다. 다시 시도해주세요.' 
    //   }]);
    // } finally {
    //   setLoading(false);
    // }
    
    // 더미 데이터로 응답 (프로토타입용)
    setTimeout(() => {
      const aiMessage = { 
        type: 'ai', 
        content: getDummyResponse(input) 
      };
      setMessages(prev => [...prev, aiMessage]);
      setLoading(false);
    }, 1000);
  };

  const suggestedQuestions = [
    "총 자산 수는 얼마인가요?",
    "노트북 관련 자산이 몇 개 있나요?",
    "교체가 필요한 자산이 있나요?",
    "5 년 이상 사용한 자산은 무엇인가요?",
  ];

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold mb-4">AI 질의응답</h1>
        
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

        <div className="border rounded-lg h-96 overflow-y-auto p-4 bg-white">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-gray-500">
              질문을 입력하세요.
            </div>
          )}
          
          {messages.map((msg, i) => (
            <div key={i} className={`flex mb-4 ${msg.type === 'user' ? 'justify-end' : ''}`}>
              {msg.type === 'ai' && (
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2">
                  <Bot size={16} className="text-blue-600" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-lg p-3 ${
                msg.type === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                <div className="whitespace-pre-line">{msg.content}</div>
              </div>
              {msg.type === 'user' && (
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center ml-2">
                  <User size={16} className="text-gray-600" />
                </div>
              )}
            </div>
          ))}
          
          {loading && (
            <div className="flex mb-4">
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
            placeholder="질문을 입력하세요..."
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
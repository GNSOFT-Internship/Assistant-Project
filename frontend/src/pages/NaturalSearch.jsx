import React, { useState } from 'react';
import { Search, MessageSquare } from 'lucide-react';
import { mockSearchResults, mockAssets } from '../utils/dummyData';

export default function NaturalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setResults(null);
    
    // TODO: 실제 AI API 연결 시 아래 코드를 해제하고 실제 API 호출로 교체
    // const response = await aiApi.naturalLanguageSearch(query);
    // setResults(response.data.data);
    
    // 더미 데이터로 응답 (프로토타입용)
    setTimeout(() => {
      const filteredAssets = mockAssets.filter(asset => {
        const queryLower = query.toLowerCase();
        return asset.assetName?.toLowerCase().includes(queryLower) ||
               asset.category?.toLowerCase().includes(queryLower) ||
               asset.location?.toLowerCase().includes(queryLower);
      });
      
      setResults({
        explanation: `"${query}"에 대한 검색 결과입니다.`,
        assets: filteredAssets.length > 0 ? filteredAssets : mockAssets.slice(0, 10),
      });
      setLoading(false);
    }, 800);
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold mb-4">AI 자연어 검색</h1>
        <p className="text-gray-600 mb-4">
          예를 들어 "3 년 이상 사용한 노트북 보여줘", "100 만원 이상인 IT 장비 찾기" 등의 질문을 입력하세요.
        </p>
        
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색할 내용을 입력하세요..."
            className="input flex-1"
          />
          <button type="submit" className="btn btn-primary flex items-center gap-2">
            <Search size={16} /> 검색
          </button>
        </form>
      </div>

      {loading && <div className="card">검색 중...</div>}

      {results && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-lg font-semibold mb-2">검색 결과</h2>
            <p className="text-sm text-gray-600">{results.explanation}</p>
            <p className="text-sm text-gray-600 mt-1">찾은 자산: {results.assets?.length || 0}개</p>
          </div>

          {results.assets && results.assets.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="table">
                <thead className="table-header">
                  <tr>
                    <th className="table-cell">자산명</th>
                    <th className="table-cell">자산번호</th>
                    <th className="table-cell">카테고리</th>
                    <th className="table-cell">위치</th>
                    <th className="table-cell">구매가</th>
                    <th className="table-cell">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {results.assets.map((asset) => (
                    <tr key={asset.id} className="border-t">
                      <td className="table-cell font-medium">{asset.assetName}</td>
                      <td className="table-cell">{asset.assetCode}</td>
                      <td className="table-cell">{asset.category}</td>
                      <td className="table-cell">{asset.location}</td>
                      <td className="table-cell">{asset.purchasePrice?.toLocaleString()}원</td>
                      <td className="table-cell">
                        <span className={`px-2 py-1 rounded text-xs ${
                          asset.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                          asset.status === 'REPLACEMENT_NEEDED' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {asset.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {results.assets && results.assets.length === 0 && (
            <div className="card text-center text-gray-500">
              일치하는 자산을 찾을 수 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
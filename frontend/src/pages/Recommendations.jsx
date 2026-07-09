import React, { useState, useEffect } from 'react';
import { aiApi } from '../services/api';
import { TrendingUp } from 'lucide-react';

export default function Recommendations() {
  const [recommendations, setRecommendations] = useState([]);
  const [budget, setBudget] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async (budgetValue) => {
    setLoading(true);
    try {
      const response = await aiApi.getReplacementRecommendation(budgetValue);
      setRecommendations(response.data.data.recommendations || []);
    } catch (error) {
      console.error('추천 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBudgetChange = (e) => {
    const value = e.target.value ? parseFloat(e.target.value) : null;
    setBudget(value);
  };

  const handleBudgetKeyDown = (e) => {
    if (e.key === 'Enter') {
      loadRecommendations(budget);
    }
  };

  if (loading) return <div className="card">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <h1 className="text-2xl font-bold">AI 교체 우선순위 추천</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm whitespace-nowrap">예산 제한 (원):</label>
            <input
              type="number"
              value={budget || ''}
              onChange={handleBudgetChange}
              onKeyDown={handleBudgetKeyDown}
              placeholder="입력 후 Enter"
              className="input w-40"
            />
            <button
              onClick={() => loadRecommendations(budget)}
              className="btn btn-secondary"
            >
              조회
            </button>
          </div>
        </div>

        {recommendations.length > 0 && (
          <div className="space-y-4">
            {recommendations.map((rec, index) => (
              <div key={rec.assetId} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold">{rec.assetName}</h3>
                    <p className="text-sm text-gray-600">{rec.assetCode}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {rec.score?.toFixed(1)}점
                    </div>
                    <div className="text-xs text-gray-500">우선순위 점수</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-3">
                  <div>
                    <div className="text-gray-500">구매가</div>
                    <div className="font-medium">{rec.purchasePrice?.toLocaleString()}원</div>
                  </div>
                  <div>
                    <div className="text-gray-500">누적 수리비</div>
                    <div className="font-medium">{rec.totalRepairCost?.toLocaleString()}원</div>
                  </div>
                  <div>
                    <div className="text-gray-500">사용기간</div>
                    <div className="font-medium">{rec.usedYears}/{rec.usefulLife}년</div>
                  </div>
                  <div>
                    <div className="text-gray-500">고장횟수</div>
                    <div className="font-medium">{rec.maintenanceCount}회</div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded p-3">
                  <div className="text-sm font-medium text-blue-900 mb-1">AI 추천 이유:</div>
                  <div className="text-sm text-blue-800">{rec.reason}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {recommendations.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            교체 권장 자산이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
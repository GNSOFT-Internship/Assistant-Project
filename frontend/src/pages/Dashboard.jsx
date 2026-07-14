import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiApi } from '../services/api';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { formatPercent, formatCurrency } from '../utils/format';
import LoadingState from '../components/LoadingState';

const BUDGET_WARNING_THRESHOLD = 90;

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await aiApi.getDashboardData();
      setData(response.data.data);
    } catch (err) {
      console.error('대시보드 데이터 로드 실패:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <div className="card text-center py-10">
        <p className="text-gray-600 mb-4">대시보드 데이터를 불러오지 못했습니다.</p>
        <button onClick={fetchDashboardData} className="btn btn-primary">다시 시도</button>
      </div>
    );
  }

  const budgetWarning =
    data.hasBudgetData &&
    data.budgetConsumptionRate != null &&
    data.budgetConsumptionRate >= BUDGET_WARNING_THRESHOLD;

  const stats = [
    { label: '이번달 유지보수 비용', value: formatCurrency(data.currentMonthMaintenanceCost), icon: TrendingUp, color: 'text-blue-600' },
    { label: '신규 고장 건수', value: data.newFailureCount, icon: AlertCircle, color: 'text-red-600' },
    { label: '가동률', value: formatPercent(data.operationRate), icon: CheckCircle, color: 'text-green-600' },
    {
      label: '예산 소진율',
      value: data.budgetConsumptionRate != null ? formatPercent(data.budgetConsumptionRate) : '데이터 없음',
      icon: budgetWarning ? AlertTriangle : TrendingDown,
      color: budgetWarning ? 'text-red-600' : 'text-yellow-600',
      warning: budgetWarning,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <button
          onClick={fetchDashboardData}
          className="btn btn-secondary"
        >
          새로고침
        </button>
      </div>

      {data.isSimulated && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>데모 모드:</strong> 현재 표시되는 데이터는 시뮬레이션 값입니다.
          </p>
        </div>
      )}

      {budgetWarning && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">
            <strong>예산 경고:</strong> 이번 달 예산 소진율이 {formatPercent(data.budgetConsumptionRate)}로 {BUDGET_WARNING_THRESHOLD}%를 초과했습니다. 예산 재검토가 필요합니다.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={`card ${stat.warning ? 'border-2 border-red-300 bg-red-50' : ''}`}
            >
              <div className="flex items-center">
                <div className={`p-3 rounded-full ${stat.warning ? 'bg-red-100' : 'bg-gray-100'} ${stat.color}`}>
                  <Icon size={24} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                  <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">자산 현황</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">총 자산 수</span>
              <span className="font-semibold">{data.totalAssets}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">가동 중</span>
              <span className="font-semibold text-green-600">{data.activeAssets}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">교체 필요</span>
              <span className="font-semibold text-red-600">{data.replacementNeededAssets}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">빠른 링크</h3>
          <div className="space-y-2">
            <button
              onClick={() => navigate('/assets')}
              className="block w-full text-left p-3 bg-gray-50 rounded hover:bg-gray-100"
            >
              자산 관리 보기
            </button>
            <button
              onClick={() => navigate('/maintenance')}
              className="block w-full text-left p-3 bg-gray-50 rounded hover:bg-gray-100"
            >
              유지보수 분석
            </button>
            <button
              onClick={() => navigate('/recommendations')}
              className="block w-full text-left p-3 bg-gray-50 rounded hover:bg-gray-100"
            >
              교체 추천 확인
            </button>
            <button
              onClick={() => navigate('/qa')}
              className="block w-full text-left p-3 bg-gray-50 rounded hover:bg-gray-100"
            >
              AI 질문하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiApi, assetApi } from '../services/api';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, AlertTriangle, History } from 'lucide-react';
import { formatPercent, formatCurrency, formatRelativeTime } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import LoadingState from '../components/LoadingState';

const BUDGET_WARNING_THRESHOLD = 90;
const RECENT_ACTIVITY_COUNT = 5;

// AuditLog.jsx와 동일한 라벨/색상 체계를 써서, 감사 로그 전체 화면과 대시보드 요약이
// 서로 다른 용어로 보이지 않게 한다.
const ACTION_LABEL = {
  CREATE: '등록',
  UPDATE: '수정',
  DELETE: '삭제',
};

const ACTION_STYLE = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [recentLogs, setRecentLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    // 감사 로그 조회는 서버에서 관리자 전용(403)이므로, 관리자가 아니면 요청 자체를
    // 보내지 않는다 (일반 계정에게는 굳이 실패하는 요청/에러 로그를 만들 필요가 없음).
    if (!isAdmin) {
      setLoadingLogs(false);
      return;
    }
    fetchRecentActivity();
  }, [isAdmin]);

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

  const fetchRecentActivity = async () => {
    setLoadingLogs(true);
    try {
      const response = await assetApi.getAuditLogs({ page: 1, pageSize: RECENT_ACTIVITY_COUNT });
      setRecentLogs(response.data.data.items || []);
    } catch (err) {
      console.error('최근 활동 로드 실패:', err);
    } finally {
      setLoadingLogs(false);
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

            {data.topReplacementNeeded?.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-gray-500 mb-2">교체 우선순위 상위 {data.topReplacementNeeded.length}건</p>
                <div className="space-y-1.5">
                  {data.topReplacementNeeded.map((asset, i) => (
                    <button
                      key={asset.assetId}
                      onClick={() => navigate(`/assets/${asset.assetId}`)}
                      className="w-full flex items-center justify-between text-sm p-2 bg-red-50 rounded hover:bg-red-100 text-left"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-red-600 font-semibold flex-shrink-0">{i + 1}</span>
                        <span className="truncate">{asset.assetName}</span>
                      </span>
                      <span className="text-red-600 font-medium flex-shrink-0 ml-2">{asset.score}점</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <History size={18} className="text-gray-500" />
              최근 활동
            </h3>
            {isAdmin && (
              <button
                onClick={() => navigate('/audit-log')}
                className="text-sm text-blue-600 hover:underline"
              >
                전체 보기
              </button>
            )}
          </div>

          {!isAdmin ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              최근 활동은 관리자만 확인할 수 있습니다.
            </p>
          ) : loadingLogs ? (
            <p className="text-sm text-gray-500 py-6 text-center">불러오는 중...</p>
          ) : recentLogs.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">최근 활동 내역이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {recentLogs.map((log) => (
                <li key={log.id} className="flex items-start gap-3 text-sm">
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${ACTION_STYLE[log.action] || 'bg-gray-100 text-gray-700'}`}
                  >
                    {ACTION_LABEL[log.action] || log.action}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 truncate">
                      <span className="font-medium">{log.changedBy || '알 수 없음'}</span>
                      님이{' '}
                      <span className="font-medium">{log.assetName || log.assetCode || `자산 #${log.assetId}`}</span>
                      을(를) {ACTION_LABEL[log.action] || log.action}했습니다
                    </p>
                    <p className="text-xs text-gray-400">{formatRelativeTime(log.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
import React, { useState, useEffect, useCallback } from 'react';
import { budgetApi, aiApi } from '../services/api';
import { Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatPercent } from '../utils/format';
import LoadingState from '../components/LoadingState';

export default function Budget() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'ADMIN';
  const [year, setYear] = useState(new Date().getFullYear());
  const [budgets, setBudgets] = useState({});
  const [monthlyCosts, setMonthlyCosts] = useState({});
  const [inputs, setInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [savingAll, setSavingAll] = useState(false);

  // AI 예산 예측 및 시뮬레이터 관련 State
  const [forecast, setForecast] = useState(null);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [totalBudgetInput, setTotalBudgetInput] = useState('');
  const [simulation, setSimulation] = useState(null);
  const [loadingSimulation, setLoadingSimulation] = useState(false);

  const handleGetForecast = async () => {
    setLoadingForecast(true);
    try {
      const response = await aiApi.getBudgetForecast();
      setForecast(response.data);
    } catch (error) {
      console.error('AI 예산 예측 실패:', error);
      toast.error('AI 예산 예측을 불러오는 데 실패했습니다.');
    } finally {
      setLoadingForecast(false);
    }
  };

  const handleApplyForecast = () => {
    if (!forecast) return;
    const newInputs = { ...inputs };
    forecast.monthlyForecast.forEach((item) => {
      newInputs[item.month] = String(item.amount);
    });
    setInputs(newInputs);
    toast.success('AI 예측 예산 금액이 입력창에 일괄 대입되었습니다. 저장하려면 상단의 "전체 저장" 버튼을 눌러주세요.');
  };

  const handleSimulate = async (e) => {
    e.preventDefault();
    const budgetVal = parseFloat(totalBudgetInput);
    if (!totalBudgetInput || Number.isNaN(budgetVal) || budgetVal <= 0) {
      toast.error('올바른 예산 총액을 입력하세요.');
      return;
    }
    setLoadingSimulation(true);
    try {
      const response = await aiApi.simulateBudget(budgetVal);
      setSimulation(response.data);
    } catch (error) {
      console.error('AI 예산 시뮬레이션 실패:', error);
      toast.error('AI 예산 시뮬레이션에 실패했습니다.');
    } finally {
      setLoadingSimulation(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [budgetRes, analysisRes] = await Promise.all([
        budgetApi.getAll(),
        aiApi.getMaintenanceAnalysis(),
      ]);
      const byMonth = {};
      (budgetRes.data.data || []).forEach((b) => {
        if (b.year === year) byMonth[b.month] = b.allocatedAmount;
      });
      setBudgets(byMonth);
      setInputs(Object.fromEntries(Object.entries(byMonth).map(([m, v]) => [m, String(v)])));
      setMonthlyCosts(analysisRes.data.data?.costTrend?.monthlyCosts || {});
    } catch (error) {
      console.error('예산 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (month) => {
    const raw = inputs[month];
    const value = parseFloat(raw);
    if (!raw || Number.isNaN(value) || value < 0) {
      toast.error('올바른 금액을 입력하세요.');
      return;
    }
    setSaving(month);
    try {
      await budgetApi.set(year, month, value);
      await load();
    } catch (error) {
      console.error('예산 저장 실패:', error);
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(null);
    }
  };

  const handleSaveAll = async () => {
    const entries = Object.entries(inputs).filter(([, raw]) => raw !== '' && raw != null);
    if (entries.length === 0) {
      toast.error('저장할 예산이 없습니다. 최소 한 달 이상 금액을 입력하세요.');
      return;
    }
    const invalid = entries.find(([, raw]) => Number.isNaN(parseFloat(raw)) || parseFloat(raw) < 0);
    if (invalid) {
      toast.error(`${invalid[0]}월 금액이 올바르지 않습니다.`);
      return;
    }

    setSavingAll(true);
    try {
      await Promise.all(
        entries.map(([month, raw]) => budgetApi.set(year, Number(month), parseFloat(raw)))
      );
      await load();
      toast.success('예산이 저장되었습니다.');
    } catch (error) {
      console.error('일괄 저장 실패:', error);
      toast.error('일괄 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingAll(false);
    }
  };

  if (loading) return <div className="card"><LoadingState /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-2xl font-bold">예산 관리</h1>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="input w-32"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          {isAdmin && (
            <button
              onClick={handleSaveAll}
              disabled={savingAll}
              className="btn btn-primary flex items-center gap-1"
            >
              <Save size={14} /> {savingAll ? '저장 중...' : '전체 저장'}
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-gray-500 mb-4">
          월별 유지보수 예산을 배정하면 대시보드의 예산 소진율이 실제 데이터를 기준으로 계산됩니다.
        </p>
        <div className="overflow-x-auto">
          <table className="table">
            <thead className="table-header">
              <tr>
                <th className="table-cell">월</th>
                <th className="table-cell">배정 예산 (원)</th>
                <th className="table-cell">실제 사용액</th>
                <th className="table-cell">소진율</th>
                {isAdmin && <th className="table-cell">저장</th>}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                const key = `${year}-${String(month).padStart(2, '0')}`;
                const spent = monthlyCosts[key] || 0;
                const allocated = budgets[month];
                const rate = allocated ? (spent / allocated) * 100 : null;
                return (
                  <tr key={month} className="border-t">
                    <td className="table-cell font-medium">{month}월</td>
                    <td className="table-cell">
                      {isAdmin ? (
                        <input
                          type="number"
                          min="0"
                          className="input w-36"
                          value={inputs[month] ?? ''}
                          onChange={(e) => setInputs({ ...inputs, [month]: e.target.value })}
                          placeholder="미설정"
                        />
                      ) : (
                        <span>{allocated != null ? `${allocated.toLocaleString()}원` : '-'}</span>
                      )}
                    </td>
                    <td className="table-cell">{spent.toLocaleString()}원</td>
                    <td className="table-cell">
                      {rate != null ? (
                        <span
                          className={rate >= 100 ? 'badge-red' : rate >= 80 ? 'badge-yellow' : 'badge-green'}
                          title={`${rate.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`}
                        >
                          {formatPercent(rate)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="table-cell">
                        <button
                          onClick={() => handleSave(month)}
                          disabled={saving === month}
                          className="btn btn-secondary flex items-center gap-1"
                        >
                          <Save size={14} /> 저장
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: AI Forecast */}
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            🔮 AI 차년도 예산 예측
          </h3>
          <p className="text-sm text-gray-500">
            과거 월별 유지보수 지출 추이 및 현재 장비 노후도를 Qwen3.5 AI가 분석하여 차년도 월별 지출 예상액을 예측합니다.
          </p>

          {!forecast ? (
            <div className="py-8 text-center">
              <button
                onClick={handleGetForecast}
                disabled={loadingForecast}
                className="btn btn-primary"
              >
                {loadingForecast ? 'AI 분석 및 예측 중...' : '차년도 예산 예측 실행'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded text-sm text-blue-800 leading-relaxed border border-blue-100">
                <span className="font-bold">💡 AI 예측 분석 총평:</span> {forecast.rationale}
              </div>

              <div className="overflow-y-auto max-h-64 border rounded">
                <table className="table min-w-full text-xs">
                  <thead className="table-header bg-gray-50">
                    <tr>
                      <th className="table-cell">월</th>
                      <th className="table-cell text-right">예측 금액</th>
                      <th className="table-cell">예측 근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.monthlyForecast.map((item) => (
                      <tr key={item.month} className="border-t">
                        <td className="table-cell font-bold text-center">{item.month}월</td>
                        <td className="table-cell font-semibold text-right text-blue-700">{item.amount?.toLocaleString()}원</td>
                        <td className="table-cell text-gray-600">{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isAdmin && (
                <button
                  onClick={handleApplyForecast}
                  className="btn btn-secondary w-full py-2 flex items-center justify-center gap-1"
                >
                  위 예측값을 입력창에 일괄 대입하기
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Column: AI Simulator */}
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            📊 AI 예산 최적화 시뮬레이터
          </h3>
          <p className="text-sm text-gray-500">
            가용할 수 있는 전체 예산 상한액을 입력하면, 노후도가 높은 급박한 카테고리에 맞추어 AI가 최적 비율로 예산을 배분합니다.
          </p>

          <form onSubmit={handleSimulate} className="flex gap-2">
            <input
              type="number"
              min="0"
              required
              placeholder="예산 총액 입력 (예: 50000000)"
              value={totalBudgetInput}
              onChange={(e) => setTotalBudgetInput(e.target.value)}
              className="input flex-1"
            />
            <button
              type="submit"
              disabled={loadingSimulation}
              className="btn btn-primary"
            >
              {loadingSimulation ? '시뮬레이션 중...' : '가동'}
            </button>
          </form>

          {simulation && (
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded text-sm text-green-800 leading-relaxed border border-green-100">
                <span className="font-bold">📋 시뮬레이션 요약:</span> {simulation.summary}
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-700">카테고리별 배분 추천</div>
                {simulation.allocations.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-gray-600">
                      <span>{item.category}</span>
                      <span className="font-bold text-gray-900">
                        {item.allocatedAmount?.toLocaleString()}원 ({(item.ratio * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${item.ratio * 100}%` }}
                      ></div>
                    </div>
                    <div className="text-[11px] text-gray-500 italic pl-1 leading-relaxed">
                      {item.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

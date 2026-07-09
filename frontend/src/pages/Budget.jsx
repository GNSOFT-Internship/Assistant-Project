import React, { useState, useEffect, useCallback } from 'react';
import { budgetApi, aiApi } from '../services/api';
import { Save } from 'lucide-react';

export default function Budget() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [budgets, setBudgets] = useState({});
  const [monthlyCosts, setMonthlyCosts] = useState({});
  const [inputs, setInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

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
      alert('올바른 금액을 입력하세요.');
      return;
    }
    setSaving(month);
    try {
      await budgetApi.set(year, month, value);
      await load();
    } catch (error) {
      console.error('예산 저장 실패:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="card">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-2xl font-bold">예산 관리</h1>
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
          className="input w-32"
        >
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
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
                <th className="table-cell">저장</th>
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
                      <input
                        type="number"
                        min="0"
                        className="input w-36"
                        value={inputs[month] ?? ''}
                        onChange={(e) => setInputs({ ...inputs, [month]: e.target.value })}
                        placeholder="미설정"
                      />
                    </td>
                    <td className="table-cell">{spent.toLocaleString()}원</td>
                    <td className="table-cell">
                      {rate != null ? (
                        <span className={rate >= 100 ? 'badge-red' : rate >= 80 ? 'badge-yellow' : 'badge-green'}>
                          {rate.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <button
                        onClick={() => handleSave(month)}
                        disabled={saving === month}
                        className="btn btn-secondary flex items-center gap-1"
                      >
                        <Save size={14} /> 저장
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

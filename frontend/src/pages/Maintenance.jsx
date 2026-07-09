import React, { useState, useEffect } from 'react';
import { aiApi } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const TOP_FAILURE_COUNT = 5;

export default function Maintenance() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalysis();
  }, []);

  const loadAnalysis = async () => {
    try {
      const response = await aiApi.getMaintenanceAnalysis();
      setAnalysis(response.data.data);
    } catch (error) {
      console.error('분석 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="card">로딩 중...</div>;
  if (!analysis) return <div className="card">분석 데이터를 불러올 수 없습니다.</div>;

  const failureEntries = Object.entries(analysis.failurePatterns || {}).sort((a, b) => b[1] - a[1]);
  const totalFailures = failureEntries.reduce((sum, [, v]) => sum + v, 0);
  const topFailures = failureEntries.slice(0, TOP_FAILURE_COUNT);
  const otherFailureCount = failureEntries.slice(TOP_FAILURE_COUNT).reduce((sum, [, v]) => sum + v, 0);
  const failureChartData = [
    ...topFailures.map(([name, value]) => ({ name, value })),
    ...(otherFailureCount > 0 ? [{ name: '기타', value: otherFailureCount }] : []),
  ];

  const costData = Object.entries(analysis.costTrend?.monthlyCosts || {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold mb-4">AI 유지보수 분석</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-gray-600">총 유지보수 건수</div>
            <div className="text-2xl font-bold text-blue-600">{analysis.statistics?.totalRecords || 0}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-sm text-gray-600">총 비용</div>
            <div className="text-2xl font-bold text-green-600">
              {(analysis.statistics?.totalCost || 0).toLocaleString()}원
            </div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="text-sm text-gray-600">평균 비용</div>
            <div className="text-2xl font-bold text-yellow-600">
              {(analysis.statistics?.averageCost || 0).toLocaleString()}원
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-sm text-gray-600">이번 달 건수</div>
            <div className="text-2xl font-bold text-purple-600">{analysis.statistics?.currentMonthCount || 0}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-4">고장 유형 분포 (상위 {TOP_FAILURE_COUNT}개)</h3>
            {failureChartData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">
                표시할 고장 유형 데이터가 없습니다.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={failureChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {failureChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.name === '기타' ? '#9CA3AF' : '#3B82F6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-4">월별 비용 추이</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={costData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {failureEntries.length > 0 && (
          <div className="border rounded-lg p-4 mb-6">
            <h3 className="font-semibold mb-4">전체 고장 유형 목록</h3>
            <div className="overflow-x-auto">
              <table className="table">
                <thead className="table-header">
                  <tr>
                    <th className="table-cell">고장 유형</th>
                    <th className="table-cell">건수</th>
                    <th className="table-cell">비율</th>
                    <th className="table-cell">분포</th>
                  </tr>
                </thead>
                <tbody>
                  {failureEntries.map(([name, value]) => {
                    const percent = totalFailures ? (value / totalFailures) * 100 : 0;
                    return (
                      <tr key={name} className="border-t">
                        <td className="table-cell">{name}</td>
                        <td className="table-cell">{value}건</td>
                        <td className="table-cell">{percent.toFixed(1)}%</td>
                        <td className="table-cell w-40">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${percent}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {analysis.aiAnalysis && (
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">AI 분석 결과</h3>
            <div className="text-sm text-blue-800 whitespace-pre-line">{analysis.aiAnalysis}</div>
          </div>
        )}
      </div>
    </div>
  );
}
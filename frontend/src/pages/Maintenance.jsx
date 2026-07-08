import React, { useState, useEffect } from 'react';
import { aiApi } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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

  const failureData = Object.entries(analysis.failurePatterns || {}).map(([name, value]) => ({ name, value }));
  const costData = Object.entries(analysis.costTrend?.monthlyCosts || {}).map(([name, value]) => ({ name, value }));

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

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
            <h3 className="font-semibold mb-4">고장 유형 분포</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={failureData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {failureData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
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
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { aiApi, assetApi } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AssetStatusBadge, MaintenanceTypeBadge } from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import { ArrowLeft } from 'lucide-react';

const TOP_FAILURE_COUNT = 5;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 20 }, (_, i) => CURRENT_YEAR + 1 - i);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

function buildYearMonth(year, month) {
  if (!year || !month) return '';
  return `${year}-${String(month).padStart(2, '0')}`;
}

export default function Maintenance() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startYear, setStartYear] = useState('');
  const [startMonthNum, setStartMonthNum] = useState('');
  const [endYear, setEndYear] = useState('');
  const [endMonthNum, setEndMonthNum] = useState('');
  const [selectedFailureType, setSelectedFailureType] = useState(null);
  const [failureAssets, setFailureAssets] = useState([]);
  const [loadingFailureAssets, setLoadingFailureAssets] = useState(false);
  const [viewingAsset, setViewingAsset] = useState(null);
  const [viewingMaintenance, setViewingMaintenance] = useState([]);
  const [loadingAssetDetail, setLoadingAssetDetail] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loadingAiAnalysis, setLoadingAiAnalysis] = useState(false);

  const startMonth = buildYearMonth(startYear, startMonthNum);
  const endMonth = buildYearMonth(endYear, endMonthNum);
  const rangeInvalid = Boolean(startMonth && endMonth && startMonth > endMonth);

  useEffect(() => {
    if (rangeInvalid) {
      setLoading(false);
      return;
    }
    loadAnalysis();
    setAiAnalysis(null); // 기간이 바뀌면 이전 AI 분석은 더 이상 맞지 않으므로 비운다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMonth, endMonth, rangeInvalid]);

  const loadAnalysis = async () => {
    setLoading(true);
    try {
      const response = await aiApi.getMaintenanceAnalysis({ startMonth, endMonth });
      setAnalysis(response.data.data);
    } catch (error) {
      console.error('분석 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadAiAnalysis = async () => {
    setLoadingAiAnalysis(true);
    try {
      const response = await aiApi.getMaintenanceAnalysis({ startMonth, endMonth, includeAi: true });
      setAiAnalysis(response.data.data?.aiAnalysis || 'AI 분석 결과를 가져오지 못했습니다.');
    } catch (error) {
      console.error('AI 분석 로드 실패:', error);
      setAiAnalysis('AI 분석 중 오류가 발생했습니다.');
    } finally {
      setLoadingAiAnalysis(false);
    }
  };

  const resetRange = () => {
    setStartYear('');
    setStartMonthNum('');
    setEndYear('');
    setEndMonthNum('');
  };

  const handleFailureTypeClick = async (failureType) => {
    setSelectedFailureType(failureType);
    setLoadingFailureAssets(true);
    try {
      const response = await aiApi.getAssetsByFailureType(failureType, { startMonth, endMonth });
      setFailureAssets(response.data.data || []);
    } catch (error) {
      console.error('고장 유형별 자산 로드 실패:', error);
      setFailureAssets([]);
    } finally {
      setLoadingFailureAssets(false);
    }
  };

  const closeFailureAssetsModal = () => {
    setSelectedFailureType(null);
    setFailureAssets([]);
    setViewingAsset(null);
    setViewingMaintenance([]);
  };

  const handleAssetClick = async (assetId) => {
    setLoadingAssetDetail(true);
    try {
      const [assetRes, maintenanceRes] = await Promise.all([
        assetApi.getById(assetId),
        assetApi.getMaintenanceHistory(assetId),
      ]);
      setViewingAsset(assetRes.data.data);
      setViewingMaintenance(maintenanceRes.data.data?.items || []);
    } catch (error) {
      console.error('자산 상세 로드 실패:', error);
    } finally {
      setLoadingAssetDetail(false);
    }
  };

  const backToFailureAssetList = () => {
    setViewingAsset(null);
    setViewingMaintenance([]);
  };

  if (loading) return <div className="card"><LoadingState /></div>;
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
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h3 className="font-semibold">고장 유형 분포 (상위 {TOP_FAILURE_COUNT}개)</h3>
              <div className="flex items-center flex-wrap gap-1 text-sm">
                <select
                  value={startYear}
                  onChange={(e) => setStartYear(e.target.value)}
                  className="input py-1 text-sm w-auto"
                >
                  <option value="">년도</option>
                  {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
                <select
                  value={startMonthNum}
                  onChange={(e) => setStartMonthNum(e.target.value)}
                  className="input py-1 text-sm w-auto"
                >
                  <option value="">월</option>
                  {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}월</option>)}
                </select>
                <span className="text-gray-400">~</span>
                <select
                  value={endYear}
                  onChange={(e) => setEndYear(e.target.value)}
                  className="input py-1 text-sm w-auto"
                >
                  <option value="">년도</option>
                  {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
                <select
                  value={endMonthNum}
                  onChange={(e) => setEndMonthNum(e.target.value)}
                  className="input py-1 text-sm w-auto"
                >
                  <option value="">월</option>
                  {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}월</option>)}
                </select>
                {(startMonth || endMonth) && (
                  <button onClick={resetRange} className="btn btn-secondary py-1 px-2 text-xs">전체 기간</button>
                )}
              </div>
            </div>
            {rangeInvalid && (
              <div className="mb-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                종료월이 시작월보다 빠릅니다. 범위를 다시 선택해주세요.
              </div>
            )}
            {rangeInvalid ? null : failureChartData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">
                표시할 고장 유형 데이터가 없습니다.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={failureChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => [`${value}대`, '발생 건수']}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 4, 4, 0]}
                    onClick={(entry) => entry.name !== '기타' && handleFailureTypeClick(entry.name)}
                    cursor="pointer"
                  >
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
                <YAxis tickFormatter={(value) => value.toLocaleString()} />
                <Tooltip
                  formatter={(value) => [`${value.toLocaleString()}원`, '유지보수 비용']}
                />
                <Bar dataKey="value" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-4">
            전체 고장 유형 목록
            {(startMonth || endMonth) && (
              <span className="text-sm text-gray-500 font-normal ml-2">
                ({startMonth || '처음'} ~ {endMonth || '지금'})
              </span>
            )}
          </h3>
          {rangeInvalid ? (
            <div className="text-center text-red-600 text-sm py-6">
              종료월이 시작월보다 빠릅니다. 범위를 다시 선택해주세요.
            </div>
          ) : failureEntries.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-6">
              해당 기간에 표시할 고장 유형 데이터가 없습니다.
            </div>
          ) : (
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
                      <tr
                        key={name}
                        className="border-t cursor-pointer hover:bg-gray-50"
                        onClick={() => handleFailureTypeClick(name)}
                      >
                        <td className="table-cell text-blue-600 hover:underline">{name}</td>
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
          )}
        </div>

        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-blue-900">AI 분석 결과</h3>
            {!aiAnalysis && (
              <button
                onClick={handleLoadAiAnalysis}
                disabled={loadingAiAnalysis}
                className="btn btn-primary text-sm py-1"
              >
                {loadingAiAnalysis ? '분석 중...' : 'AI 분석하기'}
              </button>
            )}
          </div>
          {aiAnalysis ? (
            <div className="text-sm text-blue-800 whitespace-pre-line">{aiAnalysis}</div>
          ) : (
            <div className="text-sm text-blue-700">
              버튼을 누르면 현재 기간 데이터를 바탕으로 AI가 분석해드립니다.
            </div>
          )}
        </div>
      </div>

      {selectedFailureType && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={closeFailureAssetsModal}
        >
          <div
            className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {viewingAsset ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={backToFailureAssetList} className="btn btn-secondary flex items-center gap-1">
                    <ArrowLeft size={14} /> 목록으로
                  </button>
                  <button onClick={closeFailureAssetsModal} className="btn btn-secondary ml-auto">닫기</button>
                </div>

                {loadingAssetDetail ? (
                  <LoadingState className="py-8" />
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-bold">{viewingAsset.assetName}</h2>
                      <AssetStatusBadge status={viewingAsset.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                      <div>
                        <div className="text-gray-500">자산번호</div>
                        <div className="font-medium">{viewingAsset.assetCode}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">카테고리</div>
                        <div className="font-medium">{viewingAsset.category}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">위치</div>
                        <div className="font-medium">{viewingAsset.location}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">담당자</div>
                        <div className="font-medium">{viewingAsset.responsiblePerson}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">구매일</div>
                        <div className="font-medium">{viewingAsset.purchaseDate?.split('T')[0]}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">구매가</div>
                        <div className="font-medium">{viewingAsset.purchasePrice?.toLocaleString()}원</div>
                      </div>
                    </div>

                    <h3 className="font-semibold mb-2">유지보수 이력</h3>
                    {viewingMaintenance.length === 0 ? (
                      <div className="text-center text-gray-500 py-6">유지보수 이력이 없습니다.</div>
                    ) : (
                      <div className="space-y-3 mb-4">
                        {viewingMaintenance.map((record) => (
                          <div key={record.id} className="border-l-4 border-blue-500 pl-3 py-1">
                            <div className="flex justify-between items-start">
                              <div>
                                <MaintenanceTypeBadge type={record.maintenanceType} />
                                <div className="text-sm text-gray-600 mt-1">{record.description}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium">{record.cost?.toLocaleString()}원</div>
                                <div className="text-xs text-gray-500">{record.maintenanceDate?.split('T')[0]}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Link to={`/assets/${viewingAsset.id}`} className="text-sm text-blue-600 hover:underline">
                      자산 상세 페이지에서 전체 내용 보기 →
                    </Link>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">'{selectedFailureType}' 발생 자산</h2>
                  <button onClick={closeFailureAssetsModal} className="btn btn-secondary">닫기</button>
                </div>

                {loadingFailureAssets ? (
                  <LoadingState className="py-8" />
                ) : failureAssets.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">해당 고장 유형이 발생한 자산이 없습니다.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead className="table-header">
                        <tr>
                          <th className="table-cell">자산명</th>
                          <th className="table-cell">자산번호</th>
                          <th className="table-cell">카테고리</th>
                          <th className="table-cell">상태</th>
                          <th className="table-cell">발생 횟수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {failureAssets.map((asset) => (
                          <tr
                            key={asset.id}
                            className="border-t cursor-pointer hover:bg-gray-50"
                            onClick={() => handleAssetClick(asset.id)}
                          >
                            <td className="table-cell font-medium">{asset.assetName}</td>
                            <td className="table-cell">{asset.assetCode}</td>
                            <td className="table-cell">{asset.category}</td>
                            <td className="table-cell"><AssetStatusBadge status={asset.status} /></td>
                            <td className="table-cell">{asset.occurrenceCount}회</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
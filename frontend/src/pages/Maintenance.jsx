import React, { useState, useEffect, useMemo, useRef } from 'react';
import { aiApi, assetApi } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AssetStatusBadge } from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import Modal from '../components/Modal';
import AssetDetailPreview from '../components/AssetDetailPreview';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';

const TOP_FAILURE_COUNT = 5;
const FAILURE_TYPE_PAGE_SIZE = 10;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 20 }, (_, i) => CURRENT_YEAR + 1 - i);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

function buildYearMonth(year, month) {
  if (!year || !month) return '';
  return `${year}-${String(month).padStart(2, '0')}`;
}

export default function Maintenance() {
  const { theme } = useSettings();
  const isDark = theme === 'dark';
  const chartAxisColor = isDark ? '#cbd5e1' : '#6b7280'; // dark: slate-300, light: gray-500
  const chartGridColor = isDark ? '#334155' : '#e5e7eb'; // dark: slate-700, light: gray-200
  const chartTooltipStyle = {
    contentStyle: {
      backgroundColor: isDark ? '#1e293b' : '#ffffff', // dark: slate-800, light: white
      border: `1px solid ${isDark ? '#334155' : '#e5e7eb'}`, // dark: slate-700, light: gray-200
      borderRadius: '8px',
    },
    labelStyle: { color: isDark ? '#f1f5f9' : '#111827' }, // dark: slate-100, light: gray-900
    itemStyle: { color: isDark ? '#f1f5f9' : '#111827' },
  };
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startYear, setStartYear] = useState('');
  const [startMonthNum, setStartMonthNum] = useState('');
  const [endYear, setEndYear] = useState('');
  const [endMonthNum, setEndMonthNum] = useState('');
  const [selectedFailureType, setSelectedFailureType] = useState(null);
  const [failureTypePage, setFailureTypePage] = useState(1);
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

  // 요청을 보낸 뒤 응답이 오기 전에 사용자가 기간을 또 바꾸면, 먼저 보낸(이제는 낡은)
  // 요청의 응답이 나중에 도착해 최신 상태를 덮어쓸 수 있다(네트워크 순서는 요청 순서와
  // 다를 수 있으므로). 응답을 반영하기 직전에 "그 사이 기간이 바뀌지 않았는지"를 이
  // ref로 확인해서, 바뀌었으면 그 응답은 버린다.
  const currentRangeRef = useRef('');
  currentRangeRef.current = `${startMonth}|${endMonth}`;

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
    const requestedRange = currentRangeRef.current;
    setLoading(true);
    try {
      const response = await aiApi.getMaintenanceAnalysis({ startMonth, endMonth });
      // 응답을 반영하는 것만 막는다 — 로딩 상태까지 막아버리면 최신 요청이 없는 한
      // 화면이 계속 로딩 중으로 멈춰버린다.
      if (currentRangeRef.current === requestedRange) setAnalysis(response.data.data);
    } catch (error) {
      console.error('분석 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadAiAnalysis = async () => {
    const requestedRange = currentRangeRef.current;
    setLoadingAiAnalysis(true);
    try {
      const response = await aiApi.getMaintenanceAnalysis({ startMonth, endMonth, includeAi: true });
      // 응답을 반영하는 것만 막는다 — 로딩 상태까지 막아버리면 버튼이 "분석 중..."에서
      // 영원히 멈춰버린다(그 사이 최신 기간에 대해 다시 누른 요청도 없다면).
      if (currentRangeRef.current === requestedRange) {
        setAiAnalysis(response.data.data?.aiAnalysis || 'AI 분석 결과를 가져오지 못했습니다.');
      }
    } catch (error) {
      console.error('AI 분석 로드 실패:', error);
      if (currentRangeRef.current === requestedRange) setAiAnalysis('AI 분석 중 오류가 발생했습니다.');
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

  // 모달 열기/닫기 같은 분석 결과와 무관한 상태가 바뀔 때마다 이 파생 데이터들이
  // 다시 계산되지 않도록 analysis가 실제로 바뀔 때만 재계산한다.
  const { failureEntries, totalFailures, failureChartData, costData } = useMemo(() => {
    const entries = Object.entries(analysis?.failurePatterns || {}).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    const top = entries.slice(0, TOP_FAILURE_COUNT);
    const otherCount = entries.slice(TOP_FAILURE_COUNT).reduce((sum, [, v]) => sum + v, 0);
    const chartData = [
      ...top.map(([name, value]) => ({ name, value })),
      ...(otherCount > 0 ? [{ name: '기타', value: otherCount }] : []),
    ];
    const cost = Object.entries(analysis?.costTrend?.monthlyCosts || {}).map(([name, value]) => ({ name, value }));
    return { failureEntries: entries, totalFailures: total, failureChartData: chartData, costData: cost };
  }, [analysis]);

  const failureTypeTotalPages = Math.max(1, Math.ceil(failureEntries.length / FAILURE_TYPE_PAGE_SIZE));
  const pagedFailureEntries = failureEntries.slice(
    (failureTypePage - 1) * FAILURE_TYPE_PAGE_SIZE,
    failureTypePage * FAILURE_TYPE_PAGE_SIZE
  );

  // 조회 기간이 바뀌는 등으로 목록이 바뀌면 이전 페이지 번호가 더 이상 유효하지
  // 않을 수 있으므로(빈 페이지 노출 방지) 항상 유효 범위로 당겨준다.
  useEffect(() => {
    setFailureTypePage((p) => Math.min(p, failureTypeTotalPages));
  }, [failureTypeTotalPages]);

  if (loading) return <div className="card"><LoadingState /></div>;
  if (!analysis) return <div className="card">분석 데이터를 불러올 수 없습니다.</div>;

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold mb-4">AI 유지보수 분석</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-slate-400">총 유지보수 건수</div>
            <div className="text-2xl font-bold text-blue-600">{analysis.statistics?.totalRecords || 0}</div>
          </div>
          <div className="bg-green-50 dark:bg-green-500/10 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-slate-400">총 비용</div>
            <div className="text-2xl font-bold text-green-600">
              {(analysis.statistics?.totalCost || 0).toLocaleString()}원
            </div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-500/10 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-slate-400">평균 비용</div>
            <div className="text-2xl font-bold text-yellow-600">
              {(analysis.statistics?.averageCost || 0).toLocaleString()}원
            </div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-500/10 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-slate-400">이번 달 건수</div>
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
                  disabled={loadingAiAnalysis}
                  className="input py-1 text-sm w-auto"
                >
                  <option value="">년도</option>
                  {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
                <select
                  value={startMonthNum}
                  onChange={(e) => setStartMonthNum(e.target.value)}
                  disabled={loadingAiAnalysis}
                  className="input py-1 text-sm w-auto"
                >
                  <option value="">월</option>
                  {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}월</option>)}
                </select>
                <span className="text-gray-400 dark:text-slate-500">~</span>
                <select
                  value={endYear}
                  onChange={(e) => setEndYear(e.target.value)}
                  disabled={loadingAiAnalysis}
                  className="input py-1 text-sm w-auto"
                >
                  <option value="">년도</option>
                  {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
                <select
                  value={endMonthNum}
                  onChange={(e) => setEndMonthNum(e.target.value)}
                  disabled={loadingAiAnalysis}
                  className="input py-1 text-sm w-auto"
                >
                  <option value="">월</option>
                  {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}월</option>)}
                </select>
                {(startMonth || endMonth) && (
                  <button onClick={resetRange} disabled={loadingAiAnalysis} className="btn btn-secondary py-1 px-2 text-xs">전체 기간</button>
                )}
              </div>
            </div>
            {rangeInvalid && (
              <div className="mb-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded px-3 py-2">
                종료월이 시작월보다 빠릅니다. 범위를 다시 선택해주세요.
              </div>
            )}
            {rangeInvalid ? null : failureChartData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                표시할 고장 유형 데이터가 없습니다.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={failureChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: chartAxisColor }} />
                  <Tooltip
                    {...chartTooltipStyle}
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
              <BarChart data={costData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: chartAxisColor }} />
                <YAxis width={80} tick={{ fontSize: 12, fill: chartAxisColor }} tickFormatter={(value) => value.toLocaleString()} />
                <Tooltip
                  {...chartTooltipStyle}
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
              <span className="text-sm text-gray-500 dark:text-slate-400 font-normal ml-2">
                ({startMonth || '처음'} ~ {endMonth || '지금'})
              </span>
            )}
          </h3>
          {rangeInvalid ? (
            <div className="text-center text-red-600 text-sm py-6">
              종료월이 시작월보다 빠릅니다. 범위를 다시 선택해주세요.
            </div>
          ) : failureEntries.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-slate-500 text-sm py-6">
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
                  {pagedFailureEntries.map(([name, value]) => {
                    const percent = totalFailures ? (value / totalFailures) * 100 : 0;
                    return (
                      <tr
                        key={name}
                        className="border-t cursor-pointer hover:bg-gray-50 hover:dark:bg-slate-900"
                        onClick={() => handleFailureTypeClick(name)}
                      >
                        <td className="table-cell text-blue-600 hover:underline">{name}</td>
                        <td className="table-cell">{value}건</td>
                        <td className="table-cell">{percent.toFixed(1)}%</td>
                        <td className="table-cell w-40">
                          <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
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

          {failureEntries.length > FAILURE_TYPE_PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-slate-400">
              <div>
                전체 {failureEntries.length}건 중 {(failureTypePage - 1) * FAILURE_TYPE_PAGE_SIZE + 1}-
                {Math.min(failureTypePage * FAILURE_TYPE_PAGE_SIZE, failureEntries.length)}건
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFailureTypePage((p) => Math.max(1, p - 1))}
                  disabled={failureTypePage <= 1}
                  aria-label="고장 유형 이전 페이지"
                  className="btn btn-secondary px-2 py-1 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span>{failureTypePage} / {failureTypeTotalPages}</span>
                <button
                  onClick={() => setFailureTypePage((p) => Math.min(failureTypeTotalPages, p + 1))}
                  disabled={failureTypePage >= failureTypeTotalPages}
                  aria-label="고장 유형 다음 페이지"
                  className="btn btn-secondary px-2 py-1 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-blue-900 dark:text-blue-300">AI 분석 결과</h3>
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
            <div className="text-sm text-blue-800 dark:text-blue-300 whitespace-pre-line">{aiAnalysis}</div>
          ) : (
            <div className="text-sm text-blue-700">
              버튼을 누르면 현재 기간 데이터를 바탕으로 AI가 분석해드립니다.
            </div>
          )}
        </div>
      </div>

      <Modal open={!!selectedFailureType} onClose={closeFailureAssetsModal} maxWidth="max-w-2xl">
            {viewingAsset ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={backToFailureAssetList} className="btn btn-secondary flex items-center gap-1">
                    <ArrowLeft size={14} /> 목록으로
                  </button>
                  <button onClick={closeFailureAssetsModal} className="btn btn-secondary ml-auto">닫기</button>
                </div>

                <AssetDetailPreview
                  asset={viewingAsset}
                  maintenance={viewingMaintenance}
                  loading={loadingAssetDetail}
                />
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
                  <div className="text-center text-gray-500 dark:text-slate-400 py-8">해당 고장 유형이 발생한 자산이 없습니다.</div>
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
                            className="border-t cursor-pointer hover:bg-gray-50 hover:dark:bg-slate-900"
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
      </Modal>
    </div>
  );
}
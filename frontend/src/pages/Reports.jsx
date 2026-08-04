import React from 'react';
import { reportApi } from '../services/api';
import { FileText, Download, RefreshCw } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../utils/format';
import Dropdown from '../components/Dropdown';

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
// PDF는 AI 서술까지 포함해 서버가 통째로 만든 뒤 한 번에 내려주는 방식이라 실제
// "다운로드 진행률"은 의미가 없다(전송 자체는 완성 즉시 순식간에 끝남). 그래서 평소
// 소요 시간(경험적 추정치) 대비 경과 비율로 "예상 진행률"을 보여주고, 실제 완료 시 100%로 스냅한다.
const ESTIMATED_PDF_SECONDS = 12;

export default function Reports() {
  const toast = useToast();
  const [generating, setGenerating] = React.useState(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);

  const [loading, setLoading] = React.useState(true);
  const [report, setReport] = React.useState(null);
  const [loadingAiSummary, setLoadingAiSummary] = React.useState(false);
  const [year, setYear] = React.useState(CURRENT_YEAR);
  const [month, setMonth] = React.useState(CURRENT_MONTH);
  const abortControllerRef = React.useRef(null);
  // AbortController.abort()는 "요청 취소를 시도"할 뿐, 로컬 서버처럼 응답이 빠른 환경에서는
  // 사용자가 취소 버튼을 누르는 시점에 이미 응답이 도착해 있어 취소가 씹힐 수 있다.
  // 그래서 매 다운로드 시도마다 세대 번호를 증가시키고, 응답이 왔을 때 "지금도 최신 요청인지"를
  // 다시 확인해서, 취소되었거나 그 사이 다른 연/월로 새 요청이 시작된 옛 응답은 그냥 버린다.
  const generationRef = React.useRef(0);

  const handleYearChange = (newYear) => {
    setYear(newYear);
    // 현재 연도로 바꿨는데 이미 선택된 월이 미래 달이면 이번 달로 당겨온다
    if (newYear === CURRENT_YEAR && month > CURRENT_MONTH) {
      setMonth(CURRENT_MONTH);
    }
  };

  // handleLoadAiSummary는 응답이 오면 "현재" report 상태에 병합하므로(setReport(prev => ...)),
  // 요청이 떠 있는 동안 연/월이 바뀌면 예전 기간의 AI 요약이 새 기간의 통계 위에 잘못
  // 덮어써질 수 있다. AI 호출은 토큰 비용이 들어서 응답을 받은 뒤 버리는 것보다, 요청이
  // 진행되는 동안 연/월 선택 자체를 막아 애초에 바뀔 수 없게 한다.
  const loadPreview = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await reportApi.getMonthly({ year, month });
      setReport(response.data.data);
    } catch (error) {
      console.error('보고서 미리보기 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  React.useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleLoadAiSummary = async () => {
    setLoadingAiSummary(true);
    try {
      // 이미 화면에 있는 통계(report)를 그대로 넘겨서, 서버가 DB를 다시 긁어
      // 전체 통계를 재계산하지 않고 AI 서술만 생성하도록 한다.
      const response = await reportApi.getNarrative(report);
      setReport((prev) => ({ ...prev, ...response.data.data }));
    } catch (error) {
      console.error('AI 요약 로드 실패:', error);
      toast.error('AI 요약을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoadingAiSummary(false);
    }
  };

  const handleGenerate = async () => {
    // 이 요청만의 고유 세대 번호. 응답이 도착했을 때 이 번호가 여전히 최신인지 확인해서,
    // 취소되었거나 그 사이 다른 다운로드가 새로 시작된 응답이면 버린다.
    const requestGeneration = ++generationRef.current;
    // 연/월 select는 generating 동안 비활성화되지만, 취소 후 재활성화된 뒤 사용자가
    // 곧바로 다른 연/월을 선택할 수 있으므로, 파일명·내용은 "요청을 보낸 시점의 값"으로
    // 고정해 둔다 (state를 나중에 다시 읽으면 그 사이 바뀐 값을 잘못 붙일 수 있음).
    const reqYear = year;
    const reqMonth = month;

    setGenerating(true);
    setElapsedMs(0);
    const startedAt = Date.now();
    const timerId = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 200);
    abortControllerRef.current = new AbortController();
    try {
      const response = await reportApi.downloadPdf(
        { year: reqYear, month: reqMonth },
        { signal: abortControllerRef.current.signal }
      );

      // abort()가 타이밍상 서버 응답을 막지 못해 정상 응답이 그대로 와버린 경우 대비:
      // 취소 이후(또는 새 요청 시작 이후)의 낡은 응답이면 파일을 저장하지 않고 조용히 버린다.
      if (requestGeneration !== generationRef.current) return;

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `자산관리_보고서_${reqYear}-${String(reqMonth).padStart(2, '0')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      if (requestGeneration !== generationRef.current) return;
      if (error?.name === 'CanceledError' || error?.name === 'AbortError') {
        // 사용자가 취소한 경우이므로 에러 토스트를 띄우지 않는다
        return;
      }
      console.error('보고서 생성 실패:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || '보고서 생성 실패';
      toast.error(`보고서 생성 실패: ${errorMessage}`);
    } finally {
      clearInterval(timerId);
      // 이 요청이 이미 취소/대체되어 무효화된 뒤라면, 그 사이 시작된 "다음" 요청의
      // generating/abortControllerRef 상태를 잘못 초기화하지 않도록 건너뛴다.
      if (requestGeneration === generationRef.current) {
        setGenerating(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    // 세대 번호를 올려서, 이미 서버 응답이 도착해 있어 abort가 씹히더라도
    // 위의 generation 검사에서 무조건 무시되도록 한다.
    generationRef.current++;
    setGenerating(false);
    abortControllerRef.current = null;
  };

  const activeCount = report?.byStatus?.ACTIVE || 0;
  const replacementCount = report?.byStatus?.REPLACEMENT_NEEDED || 0;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">AI 보고서 자동 생성</h1>
          <div
            className="flex items-center gap-2"
            title={generating ? `${CURRENT_MONTH}월 PDF 를 다운중입니다 !` : undefined}
          >
            <label htmlFor="report-year" className="text-sm text-gray-600 dark:text-slate-400">
              보고 대상
            </label>
            <Dropdown
              id="report-year"
              value={year}
              onChange={(v) => handleYearChange(Number(v))}
              disabled={loadingAiSummary || generating}
              widthClass="w-24"
              options={YEAR_OPTIONS.map((y) => ({ value: y, label: `${y}년` }))}
            />
            <Dropdown
              id="report-month"
              value={month}
              onChange={(v) => setMonth(Number(v))}
              disabled={loadingAiSummary || generating}
              widthClass="w-20"
              options={MONTH_OPTIONS.map((m) => ({
                value: m,
                label: `${m}월`,
                disabled: year === CURRENT_YEAR && m > CURRENT_MONTH,
              }))}
            />
            <button onClick={loadPreview} className="btn btn-secondary flex items-center gap-2" disabled={loading || loadingAiSummary || generating}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              새로고침
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="text-blue-600" size={32} />
              <h2 className="text-lg font-semibold">월간 자산관리 보고서 ({year}년 {month}월)</h2>
            </div>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-slate-400 mb-6">
              <li>• 자산 현황 요약</li>
              <li>• 유지보수 비용 분석</li>
              <li>• 교체 권장 자산 목록</li>
              <li>• 주요 문제점 및 향후 관리 권장사항 (AI 생성)</li>
            </ul>
            <div>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <Download size={16} />
                  {generating ? `생성 중... (${Math.floor(elapsedMs / 1000)}초)` : 'PDF 다운로드'}
                </button>

                {generating && (
                  <button
                    onClick={handleCancel}
                    className="px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                    title="PDF 생성 취소"
                  >
                    ✕
                  </button>
                )}
              </div>
              {generating && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-500/15">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-200 ease-linear"
                    style={{
                      width: `${Math.min(96, Math.round((elapsedMs / (ESTIMATED_PDF_SECONDS * 1000)) * 100))}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="border rounded-lg p-6 bg-gray-50 dark:bg-slate-900">
            <h3 className="font-semibold mb-4">보고서 미리보기</h3>
            {loading || !report ? (
              <p className="text-sm text-gray-500 dark:text-slate-400">불러오는 중...</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400">총 자산 수</span>
                  <span className="font-medium">{report.totalAssets} 개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400">가동 중 자산</span>
                  <span className="font-medium">{activeCount} 개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400">교체 필요 자산</span>
                  <span className="font-medium text-red-600">{replacementCount} 개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400">{month}월 유지보수 비용</span>
                  <span className="font-medium">{formatCurrency(report.totalMaintenanceCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-slate-400">반복 고장 자산</span>
                  <span className="font-medium">{report.repeatedFailureCount} 개</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {!loading && report && (
          <div className="mt-6">
            {report.executiveSummary == null ? (
              <div className="border rounded-lg p-6 text-center">
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
                  AI 요약, 주요 문제점, 향후 관리 권장사항은 버튼을 눌러야 생성됩니다.
                </p>
                <button
                  onClick={handleLoadAiSummary}
                  disabled={loadingAiSummary}
                  className="btn btn-primary"
                >
                  {loadingAiSummary ? '생성 중...' : 'AI 요약 보기'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-2">AI 요약</h3>
                  <p className="text-sm text-gray-700 dark:text-slate-300">{report.executiveSummary}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-2">주요 문제점</h3>
                    <ul className="text-sm text-gray-700 dark:text-slate-300 space-y-1 list-disc list-inside">
                      {(report.keyIssues || []).map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-2">향후 관리 권장사항</h3>
                    <ul className="text-sm text-gray-700 dark:text-slate-300 space-y-1 list-disc list-inside">
                      {(report.recommendations || []).map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
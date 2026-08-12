import React from 'react';
import { reportApi } from '../services/api';
import { FileText, Download, RefreshCw, Trash2, History, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { formatCurrency } from '../utils/format';
import Dropdown from '../components/Dropdown';
import * as pdfHistory from '../utils/pdfDownloadHistory';

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const HISTORY_PAGE_SIZE = 10;

export default function Reports() {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [generating, setGenerating] = React.useState(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);

  // 'generate' = 기존 보고서 생성/미리보기 화면, 'history' = 예전에 받았던 PDF 목록
  const [activeTab, setActiveTab] = React.useState('generate');
  // handleGenerate 내부의 비동기 콜백(다운로드 완료 시점)에서 "지금 실제로 보고 있는 탭"을
  // 정확히 알기 위한 ref. state를 직접 읽으면 클릭 시점의 값으로 클로저에 고정돼버린다.
  const activeTabRef = React.useRef(activeTab);
  React.useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  const [historyEntries, setHistoryEntries] = React.useState([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  // '다운로드 기록' 탭을 보고 있지 않은 상태에서 다운로드가 끝나면 true가 되어, 탭
  // 버튼 위에 빨간 점이 뜬다. 그 탭을 클릭하는 순간 false로 꺼진다(알림 배지처럼).
  const [hasNewDownload, setHasNewDownload] = React.useState(false);
  // 방금 새로 저장된 기록의 id들. 여기 들어있는 동안만 목록 안에서 'NEW' 배지를 보여주고,
  // 일정 시간 뒤 자동으로 지운다(오래된 항목까지 계속 NEW로 남아있지 않도록).
  const [newEntryIds, setNewEntryIds] = React.useState(() => new Set());
  const newEntryTimersRef = React.useRef({});
  const markEntryAsNew = React.useCallback((id) => {
    setNewEntryIds((prev) => new Set(prev).add(id));
    clearTimeout(newEntryTimersRef.current[id]);
    newEntryTimersRef.current[id] = setTimeout(() => {
      setNewEntryIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      delete newEntryTimersRef.current[id];
    }, 10000);
  }, []);
  React.useEffect(() => {
    const timers = newEntryTimersRef.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);
  // 다운로드가 진행 중인 연/월. null이 아니면 기록 탭에 "다운로드 중..." 회색 임시 행을
  // 하나 보여준다 - 완료되면 이 값이 비워지고 실제 기록(historyEntries)에 항목이 생긴다.
  const [pendingHistoryEntry, setPendingHistoryEntry] = React.useState(null);

  // 10개 넘어가면 페이지를 나눈다. 페이지 수는 딱히 상한을 두지 않고 기록이 있는 만큼
  // 계속 늘어난다. 삭제로 인해 지금 페이지가 더 이상 존재하지 않게 되면 자동으로
  // 마지막 유효한 페이지로 당겨온다.
  const [historyPage, setHistoryPage] = React.useState(1);
  const historyTotalPages = Math.max(1, Math.ceil(historyEntries.length / HISTORY_PAGE_SIZE));
  React.useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);
  const historyPageEntries = historyEntries.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  );

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

  const refreshHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    try {
      const entries = await pdfHistory.listEntries();
      setHistoryEntries(entries);
      setHistoryPage(1);
    } catch (error) {
      console.error('다운로드 기록 로드 실패:', error);
      toast.error('다운로드 기록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setHistoryLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (activeTab === 'history') {
      refreshHistory();
    }
  }, [activeTab, refreshHistory]);

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
    setPendingHistoryEntry({ year: reqYear, month: reqMonth });
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
      const filename = `자산관리_보고서_${reqYear}-${String(reqMonth).padStart(2, '0')}.pdf`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // 방금 받은 PDF를 기록에 남긴다. 이 저장이 실패해도(사파리 프라이빗 모드 등) 이미
      // 다운로드 자체는 끝난 뒤라 사용자 흐름을 막을 이유가 없으므로 조용히 무시한다.
      // (activeTab을 직접 읽지 않고 ref로 확인하는 이유: handleGenerate는 클릭 시점의
      // activeTab을 클로저로 캡처하므로, 다운로드 중에 '다운로드 기록' 탭으로 넘어가도
      // 그 값이 갱신되지 않아 목록이 안 채워지는 버그가 있었다. ref는 항상 최신 탭을
      // 가리키므로 다운로드가 끝나는 시점에 실제로 그 탭을 보고 있는지 정확히 알 수 있다.)
      try {
        const savedEntry = await pdfHistory.addEntry({ year: reqYear, month: reqMonth, filename, blob });
        setPendingHistoryEntry(null);
        markEntryAsNew(savedEntry.id);
        if (activeTabRef.current === 'history') {
          refreshHistory();
        } else {
          // '보고서 생성' 탭에 있는 채로 다운로드가 끝난 경우에만 알림 점을 켠다.
          // 이미 기록 탭을 보고 있었다면 새 항목이 바로 눈에 보이니 점을 켤 필요가 없다.
          setHasNewDownload(true);
        }
      } catch (historyError) {
        console.error('다운로드 기록 저장 실패:', historyError);
      }
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
        setPendingHistoryEntry(null);
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
    setPendingHistoryEntry(null);
  };

  // 기록에 저장된 Blob을 그대로 내려준다 - 서버를 다시 부르지 않으므로 즉시 다운로드된다.
  const handleHistoryDownload = (entry) => {
    const url = window.URL.createObjectURL(entry.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = entry.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleHistoryDelete = async (entry) => {
    if (!(await confirmDialog(`${entry.year}년 ${entry.month}월 다운로드 기록을 삭제하시겠습니까?`, { danger: true, confirmLabel: '삭제' }))) {
      return;
    }
    try {
      await pdfHistory.deleteEntry(entry.id);
      setHistoryEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (error) {
      console.error('다운로드 기록 삭제 실패:', error);
      toast.error('삭제 중 오류가 발생했습니다.');
    }
  };

  // bytes.toFixed(0)처럼 정수로 반올림하면 8.0KB든 8.4KB든 전부 '8KB'로 뭉뚱그려져서
  // 마치 고정된 더미 값처럼 보인다. 실제 파일 크기를 소수점 한 자리까지 보여주고,
  // 정확한 바이트 수는 title 툴팁으로 확인할 수 있게 한다.
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  };

  const formatGeneratedAt = (isoString) =>
    new Date(isoString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const activeCount = report?.byStatus?.ACTIVE || 0;
  const replacementCount = report?.byStatus?.REPLACEMENT_NEEDED || 0;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">AI 보고서 자동 생성</h1>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('generate')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'generate'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                보고서 생성
              </button>
              <button
                onClick={() => {
                  setActiveTab('history');
                  setHasNewDownload(false);
                }}
                className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <History size={14} />
                다운로드 기록
                {hasNewDownload && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800" />
                )}
              </button>
            </div>
          </div>
          {activeTab === 'generate' && (
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
          )}
        </div>

        {activeTab === 'generate' && (
        <>
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
        </>
        )}

        {activeTab === 'history' && (
          <div>
            {historyLoading ? (
              <p className="text-sm text-gray-500 dark:text-slate-400 py-6 text-center">불러오는 중...</p>
            ) : historyEntries.length === 0 && !pendingHistoryEntry ? (
              <p className="text-sm text-gray-500 dark:text-slate-400 py-6 text-center">
                아직 다운로드한 보고서가 없습니다. &apos;보고서 생성&apos; 탭에서 PDF를 받으면 여기에 기록됩니다.
              </p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="table">
                  <thead className="table-header">
                    <tr>
                      <th className="table-cell">보고 대상</th>
                      <th className="table-cell">다운로드 일시</th>
                      <th className="table-cell text-right">파일 크기</th>
                      <th className="table-cell"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyPage === 1 && pendingHistoryEntry && (
                      <tr>
                        <td className="table-cell font-medium text-gray-400 dark:text-slate-500">
                          {pendingHistoryEntry.year}년 {pendingHistoryEntry.month}월
                        </td>
                        <td className="table-cell text-gray-400 dark:text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <Loader2 size={14} className="animate-spin" />
                            다운로드 중...
                          </span>
                        </td>
                        <td className="table-cell text-gray-400 dark:text-slate-500 text-right">-</td>
                        <td className="table-cell">
                          <div className="flex items-center justify-end gap-2">
                            <button disabled className="btn btn-secondary flex items-center gap-1.5 opacity-40 cursor-not-allowed">
                              <Download size={14} />
                              다운로드
                            </button>
                            <button disabled className="btn btn-danger flex items-center gap-1.5 opacity-40 cursor-not-allowed">
                              <Trash2 size={14} />
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {historyPageEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="table-cell font-medium">
                          <span className="inline-flex items-center gap-2">
                            {entry.year}년 {entry.month}월
                            {newEntryIds.has(entry.id) && (
                              <span className="badge-blue !py-0 !px-1.5 text-[10px] tracking-wide">NEW</span>
                            )}
                          </span>
                        </td>
                        <td className="table-cell">{formatGeneratedAt(entry.generatedAt)}</td>
                        <td
                          className="table-cell text-right tabular-nums"
                          title={`${entry.size.toLocaleString('ko-KR')} bytes`}
                        >
                          {formatFileSize(entry.size)}
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleHistoryDownload(entry)}
                              className="btn btn-secondary flex items-center gap-1.5"
                            >
                              <Download size={14} />
                              다운로드
                            </button>
                            <button
                              onClick={() => handleHistoryDelete(entry)}
                              className="btn btn-danger flex items-center gap-1.5"
                              title="기록 삭제"
                            >
                              <Trash2 size={14} />
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!historyLoading && historyTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-slate-400">
                <span>
                  {historyPage} / {historyTotalPages} 페이지 · 총 {historyEntries.length}건
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    className="btn btn-secondary px-3 py-1.5 text-xs"
                  >
                    이전
                  </button>
                  <button
                    onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                    disabled={historyPage === historyTotalPages}
                    className="btn btn-secondary px-3 py-1.5 text-xs"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
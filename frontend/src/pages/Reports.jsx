import React from 'react';
import { reportApi } from '../services/api';
import { FileText, Download, RefreshCw } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../utils/format';

export default function Reports() {
  const toast = useToast();
  const [generating, setGenerating] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [report, setReport] = React.useState(null);
  const [loadingAiSummary, setLoadingAiSummary] = React.useState(false);

  const loadPreview = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await reportApi.getMonthly();
      setReport(response.data.data);
    } catch (error) {
      console.error('보고서 미리보기 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
    setGenerating(true);
    try {
      const response = await reportApi.downloadPdf();

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `자산관리_보고서_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('보고서 생성 실패:', error);
      toast.error('보고서 생성 실패');
    } finally {
      setGenerating(false);
    }
  };

  const activeCount = report?.byStatus?.ACTIVE || 0;
  const replacementCount = report?.byStatus?.REPLACEMENT_NEEDED || 0;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">AI 보고서 자동 생성</h1>
          <button onClick={loadPreview} className="btn btn-secondary flex items-center gap-2" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="text-blue-600" size={32} />
              <h2 className="text-lg font-semibold">월간 자산관리 보고서</h2>
            </div>
            <ul className="space-y-2 text-sm text-gray-600 mb-6">
              <li>• 자산 현황 요약</li>
              <li>• 유지보수 비용 분석</li>
              <li>• 교체 권장 자산 목록</li>
              <li>• 주요 문제점 및 향후 관리 권장사항 (AI 생성)</li>
            </ul>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              <Download size={16} />
              {generating ? '생성 중...' : 'PDF 다운로드'}
            </button>
          </div>

          <div className="border rounded-lg p-6 bg-gray-50">
            <h3 className="font-semibold mb-4">보고서 미리보기</h3>
            {loading || !report ? (
              <p className="text-sm text-gray-500">불러오는 중...</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">총 자산 수</span>
                  <span className="font-medium">{report.totalAssets} 개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">가동 중 자산</span>
                  <span className="font-medium">{activeCount} 개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">교체 필요 자산</span>
                  <span className="font-medium text-red-600">{replacementCount} 개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">총 유지보수 비용</span>
                  <span className="font-medium">{formatCurrency(report.totalMaintenanceCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">반복 고장 자산</span>
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
                <p className="text-sm text-gray-500 mb-3">
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
                  <p className="text-sm text-gray-700">{report.executiveSummary}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-2">주요 문제점</h3>
                    <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                      {(report.keyIssues || []).map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-2">향후 관리 권장사항</h3>
                    <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
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

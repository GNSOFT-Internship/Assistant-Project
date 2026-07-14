import React, { useState, useEffect } from 'react';
import { aiApi } from '../services/api';
import { FileText, Download } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import LoadingState from '../components/LoadingState';

export default function Recommendations() {
  const toast = useToast();
  const [recommendations, setRecommendations] = useState([]);
  const [budget, setBudget] = useState(null);
  const [loading, setLoading] = useState(false);

  // 조달 사양서 생성 관련 상태
  const [specData, setSpecData] = useState(null);
  const [specAssetId, setSpecAssetId] = useState(null);
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [showSpecModal, setShowSpecModal] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleGenerateSpec = async (assetId) => {
    setLoadingSpec(true);
    setShowSpecModal(true);
    setSpecAssetId(assetId);
    try {
      const response = await aiApi.getProcurementSpec(assetId);
      setSpecData(response.data);
    } catch (error) {
      console.error('조달 규격서 생성 실패:', error);
      toast.error('조달 규격서 생성에 실패했습니다.');
      setShowSpecModal(false);
    } finally {
      setLoadingSpec(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const response = await aiApi.downloadProcurementSpecPdf(specAssetId, specData);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `조달규격서_RFP_${specData?.title || specAssetId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('조달 규격서 PDF 다운로드 실패:', error);
      toast.error('PDF 다운로드에 실패했습니다.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async (budgetValue) => {
    setLoading(true);
    try {
      const response = await aiApi.getReplacementRecommendation(budgetValue);
      setRecommendations(response.data.data.recommendations || []);
    } catch (error) {
      console.error('추천 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBudgetChange = (e) => {
    const value = e.target.value ? parseFloat(e.target.value) : null;
    setBudget(value);
  };

  const handleBudgetKeyDown = (e) => {
    if (e.key === 'Enter') {
      loadRecommendations(budget);
    }
  };

  if (loading) return <div className="card"><LoadingState /></div>;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <h1 className="text-2xl font-bold">AI 교체 우선순위 추천</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm whitespace-nowrap">예산 제한 (원):</label>
            <input
              type="number"
              value={budget || ''}
              onChange={handleBudgetChange}
              onKeyDown={handleBudgetKeyDown}
              placeholder="입력 후 Enter"
              className="input w-40"
            />
            <button
              onClick={() => loadRecommendations(budget)}
              className="btn btn-secondary"
            >
              조회
            </button>
          </div>
        </div>

        {recommendations.length > 0 && (
          <div className="space-y-4">
            {recommendations.map((rec) => (
              <div key={rec.assetId} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold">{rec.assetName}</h3>
                    <p className="text-sm text-gray-600">{rec.assetCode}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {rec.score?.toFixed(1)}점
                    </div>
                    <div className="text-xs text-gray-500">우선순위 점수</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-3">
                  <div>
                    <div className="text-gray-500">구매가</div>
                    <div className="font-medium">{rec.purchasePrice?.toLocaleString()}원</div>
                  </div>
                  <div>
                    <div className="text-gray-500">누적 수리비</div>
                    <div className="font-medium">{rec.totalRepairCost?.toLocaleString()}원</div>
                  </div>
                  <div>
                    <div className="text-gray-500">사용기간</div>
                    <div className="font-medium">{rec.usedYears}/{rec.usefulLife}년</div>
                  </div>
                  <div>
                    <div className="text-gray-500">고장횟수</div>
                    <div className="font-medium">{rec.maintenanceCount}회</div>
                  </div>
                </div>

                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-blue-900 mb-1">AI 추천 이유:</div>
                    <div className="text-sm text-blue-800">{rec.reason}</div>
                  </div>
                  <button
                    onClick={() => handleGenerateSpec(rec.assetId)}
                    className="btn btn-primary text-xs py-1.5 px-3.5 whitespace-nowrap self-end md:self-auto flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                  >
                    <FileText size={14} />
                    AI 조달 규격서/RFP 생성
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {recommendations.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            교체 권장 자산이 없습니다.
          </div>
        )}
      </div>

      {/* AI 조달 규격서 및 RFP 모달 */}
      {showSpecModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-4xl max-h-[85vh] overflow-y-auto flex flex-col p-6 space-y-4 shadow-2xl border-none">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                📋 AI 조달 구매 규격서 & 제안요청서(RFP)
              </h2>
              <button
                onClick={() => {
                  setShowSpecModal(false);
                  setSpecData(null);
                  setSpecAssetId(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                닫기
              </button>
            </div>

            {loadingSpec ? (
              <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
                <p className="text-sm text-slate-500 font-medium animate-pulse">Qwen3.5 AI 조달 사양서 및 제안요청서 생성 중...</p>
              </div>
            ) : specData ? (
              <div className="space-y-4 overflow-y-auto pr-1">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col md:flex-row justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-400 font-semibold uppercase">공고 규격서명</div>
                    <div className="text-lg font-bold text-slate-800 mt-0.5">{specData.title}</div>
                  </div>
                  <div className="text-right min-w-[150px]">
                    <div className="text-xs text-slate-400 font-semibold uppercase">예상 도입 사업비</div>
                    <div className="text-xl font-extrabold text-blue-600 mt-0.5">{specData.budgetEstimate?.toLocaleString()}원</div>
                  </div>
                </div>

                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/50 text-sm text-blue-900 leading-relaxed">
                  <span className="font-bold">💡 규격 설계 및 예산 근거:</span> {specData.rationale}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-700 border-l-4 border-blue-600 pl-2">
                      1. 조달 기술 규격 사양서
                    </h3>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                      {specData.specifications}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-700 border-l-4 border-indigo-600 pl-2">
                      2. 조달 제안요청서(RFP)
                    </h3>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                      {specData.rfp}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf}
                    className="btn btn-primary flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Download size={14} />
                    {downloadingPdf ? 'PDF 생성 중...' : '규격서/RFP PDF 다운로드'}
                  </button>
                  <button
                    onClick={() => {
                      setShowSpecModal(false);
                      setSpecData(null);
                      setSpecAssetId(null);
                    }}
                    className="btn btn-secondary"
                  >
                    닫기
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
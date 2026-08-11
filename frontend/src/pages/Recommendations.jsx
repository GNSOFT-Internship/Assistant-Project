import React, { useState, useEffect } from 'react';
import { aiApi, assetApi } from '../services/api';
import { FileText, Download, ChevronDown, ChevronUp, Save, Sparkles } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import LoadingState from '../components/LoadingState';
import Modal from '../components/Modal';

const IMPORTANCE_SOURCE_LABEL = {
  AI: 'AI 산정',
  MANUAL: '관리자 지정',
  DEFAULT: '기본값',
};

export default function Recommendations() {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [recommendations, setRecommendations] = useState([]);
  const [budget, setBudget] = useState(null);
  const [loading, setLoading] = useState(false);

  // 카테고리별 교체 우선순위 중요도(관리자가 조회/수정)
  const [showImportancePanel, setShowImportancePanel] = useState(false);
  const [categoryImportance, setCategoryImportance] = useState([]);
  const [loadingImportance, setLoadingImportance] = useState(false);
  const [editingScores, setEditingScores] = useState({});
  const [editingReasons, setEditingReasons] = useState({});
  const [savingCategory, setSavingCategory] = useState(null);
  const [aiRecomputingCategory, setAiRecomputingCategory] = useState(null);

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

  const loadCategoryImportance = async () => {
    setLoadingImportance(true);
    try {
      const response = await assetApi.getCategoryImportance();
      setCategoryImportance(response.data.data || []);
    } catch (error) {
      console.error('카테고리 중요도 로드 실패:', error);
      toast.error('카테고리 중요도를 불러오지 못했습니다.');
    } finally {
      setLoadingImportance(false);
    }
  };

  const toggleImportancePanel = () => {
    const next = !showImportancePanel;
    setShowImportancePanel(next);
    if (next && categoryImportance.length === 0) {
      loadCategoryImportance();
    }
  };

  const handleSaveImportance = async (category, currentReason) => {
    const rawValue = editingScores[category];
    const score = Number(rawValue);
    if (rawValue === undefined || rawValue === '' || Number.isNaN(score) || score < 0 || score > 100) {
      toast.error('중요도는 0~100 사이의 숫자로 입력해주세요.');
      return;
    }
    const reason = editingReasons[category] ?? currentReason ?? '';
    setSavingCategory(category);
    try {
      await assetApi.updateCategoryImportance(category, score, reason);
      toast.success(`"${category}" 중요도를 저장했습니다.`);
      await loadCategoryImportance();
      setEditingScores((prev) => {
        const next = { ...prev };
        delete next[category];
        return next;
      });
      setEditingReasons((prev) => {
        const next = { ...prev };
        delete next[category];
        return next;
      });
      // 화면에 이미 표시된 추천 목록의 점수도 최신 중요도를 반영하도록 다시 조회한다.
      loadRecommendations(budget);
    } catch (error) {
      console.error('카테고리 중요도 저장 실패:', error);
      toast.error('카테고리 중요도 저장에 실패했습니다.');
    } finally {
      setSavingCategory(null);
    }
  };

  const handleAiRecompute = async (category) => {
    setAiRecomputingCategory(category);
    try {
      await assetApi.recomputeCategoryImportanceWithAi(category);
      toast.success(`"${category}" 중요도를 AI가 다시 산정했습니다.`);
      await loadCategoryImportance();
      setEditingScores((prev) => {
        const next = { ...prev };
        delete next[category];
        return next;
      });
      setEditingReasons((prev) => {
        const next = { ...prev };
        delete next[category];
        return next;
      });
      loadRecommendations(budget);
    } catch (error) {
      console.error('AI 중요도 재산정 실패:', error);
      toast.error(error.response?.data?.detail || 'AI 중요도 재산정에 실패했습니다.');
    } finally {
      setAiRecomputingCategory(null);
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
            {isAdmin && (
              <button
                onClick={toggleImportancePanel}
                className="btn btn-secondary flex items-center gap-1"
              >
                카테고리 중요도 관리
                {showImportancePanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>
        </div>

        {isAdmin && showImportancePanel && (
          <div className="border rounded-lg p-4 mb-4 bg-gray-50 dark:bg-slate-900">
            <div className="text-sm text-gray-600 dark:text-slate-400 mb-3">
              카테고리(장비 종류)별로 교체 우선순위 점수에 반영되는 "업무 중요도"입니다. 새 카테고리는
              자산이 처음 등록될 때 AI가 자동으로 산정하며(미설정/실패 시 기본값 50점), 아래에서 언제든
              직접 값을 바꿀 수 있습니다.
            </div>
            {loadingImportance ? (
              <LoadingState />
            ) : categoryImportance.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-slate-400 py-4">
                등록된 카테고리가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table text-sm w-full">
                  <thead className="table-header">
                    <tr>
                      <th className="table-cell">카테고리</th>
                      <th className="table-cell">중요도</th>
                      <th className="table-cell">산정 방식</th>
                      <th className="table-cell">근거</th>
                      <th className="table-cell"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryImportance.map((row) => (
                      <tr key={row.category}>
                        <td className="table-cell font-medium">{row.category}</td>
                        <td className="table-cell">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="input w-20 py-1"
                            value={editingScores[row.category] ?? row.score}
                            onChange={(e) =>
                              setEditingScores((prev) => ({ ...prev, [row.category]: e.target.value }))
                            }
                          />
                        </td>
                        <td className="table-cell whitespace-nowrap">
                          {IMPORTANCE_SOURCE_LABEL[row.source] || row.source}
                        </td>
                        <td className="table-cell min-w-[260px]">
                          <textarea
                            rows={2}
                            maxLength={60}
                            className="input w-full py-1 resize-y text-gray-600 dark:text-slate-300"
                            value={editingReasons[row.category] ?? row.reason ?? ''}
                            onChange={(e) =>
                              setEditingReasons((prev) => ({ ...prev, [row.category]: e.target.value }))
                            }
                          />
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleSaveImportance(row.category, row.reason)}
                              disabled={savingCategory === row.category || aiRecomputingCategory === row.category}
                              className="btn btn-primary text-xs py-1 px-2 flex items-center gap-1"
                            >
                              <Save size={12} />
                              {savingCategory === row.category ? '저장 중...' : '저장'}
                            </button>
                            <button
                              onClick={() => handleAiRecompute(row.category)}
                              disabled={aiRecomputingCategory === row.category || savingCategory === row.category}
                              title="관리자가 지정한 값을 참고하지 않고 AI가 새로 산정합니다"
                              className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                            >
                              <Sparkles size={12} />
                              {aiRecomputingCategory === row.category ? '산정 중...' : 'AI 재산정'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {recommendations.length > 0 && (
          <div className="space-y-4">
            {recommendations.map((rec) => (
              <div key={rec.assetId} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold">{rec.assetName}</h3>
                    <p className="text-sm text-gray-600 dark:text-slate-400">{rec.assetCode}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {rec.score?.toFixed(1)}점
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">우선순위 점수</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm mb-3">
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">구매가</div>
                    <div className="font-medium">{rec.purchasePrice?.toLocaleString()}원</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">누적 수리비</div>
                    <div className="font-medium">{rec.totalRepairCost?.toLocaleString()}원</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">사용기간</div>
                    <div className="font-medium">{rec.usedYears}/{rec.usefulLife}년</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">고장횟수</div>
                    <div className="font-medium">{rec.maintenanceCount}회</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">카테고리 중요도</div>
                    <div className="font-medium">{rec.categoryImportance?.toFixed(0)}/100</div>
                  </div>
                </div>

                <div className="bg-blue-50/70 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl p-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1 flex items-center gap-2 flex-wrap">
                      <span>AI 추천 이유:</span>
                      {rec.reasonUpdatedAt && (
                        <span className="text-xs font-normal text-blue-500 dark:text-blue-400">
                          ({new Date(rec.reasonUpdatedAt).toLocaleString('ko-KR')} 작성)
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-blue-800 dark:text-blue-300">{rec.reason}</div>
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
          <div className="text-center text-gray-500 dark:text-slate-400 py-8">
            교체 권장 자산이 없습니다.
          </div>
        )}
      </div>

      {/* AI 조달 규격서 및 RFP 모달 */}
      <Modal
        open={showSpecModal}
        onClose={() => { setShowSpecModal(false); setSpecData(null); setSpecAssetId(null); }}
        maxWidth="max-w-4xl"
      >
        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3 mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            📋 AI 조달 구매 규격서 & 제안요청서(RFP)
          </h2>
          <button
            onClick={() => { setShowSpecModal(false); setSpecData(null); setSpecAssetId(null); }}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:dark:text-slate-400 font-bold"
          >
            닫기
          </button>
        </div>

        {loadingSpec ? (
          <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium animate-pulse">Qwen3.5 AI 조달 사양서 및 제안요청서 생성 중...</p>
          </div>
        ) : specData ? (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col md:flex-row justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase">공고 규격서명</div>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">{specData.title}</div>
              </div>
              <div className="text-right min-w-[150px]">
                <div className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase">예상 도입 사업비</div>
                <div className="text-xl font-extrabold text-blue-600 mt-0.5">{specData.budgetEstimate?.toLocaleString()}원</div>
              </div>
            </div>

            <div className="bg-blue-50/50 dark:bg-blue-500/10 p-4 rounded-xl border border-blue-100/50 dark:border-blue-500/20 text-sm text-blue-900 dark:text-blue-300 leading-relaxed">
              <span className="font-bold">💡 규격 설계 및 예산 근거:</span> {specData.rationale}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-l-4 border-blue-600 pl-2">
                  1. 조달 기술 규격 사양서
                </h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                  {specData.specifications}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-l-4 border-indigo-600 pl-2">
                  2. 조달 제안요청서(RFP)
                </h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                  {specData.rfp}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="btn btn-primary flex items-center gap-1.5 disabled:opacity-60"
              >
                <Download size={14} />
                {downloadingPdf ? 'PDF 생성 중...' : '규격서/RFP PDF 다운로드'}
              </button>
              <button
                onClick={() => { setShowSpecModal(false); setSpecData(null); setSpecAssetId(null); }}
                className="btn btn-secondary"
              >
                닫기
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
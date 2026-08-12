import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { aiApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import Modal from './Modal';

/** AI 조달 규격서/RFP 생성·다운로드 상태와 로직을 한 곳에서 관리한다.
 * AssetDetail/Recommendations 페이지에서 동일하게 쓰인다. */
export function useProcurementSpecModal() {
  const toast = useToast();
  const [assetId, setAssetId] = useState(null);
  const [specData, setSpecData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const generate = async (id) => {
    setAssetId(id);
    setLoading(true);
    setOpen(true);
    try {
      const response = await aiApi.getProcurementSpec(id);
      setSpecData(response.data);
    } catch (error) {
      console.error('조달 규격서 생성 실패:', error);
      toast.error('조달 규격서 생성에 실패했습니다.');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const response = await aiApi.downloadProcurementSpecPdf(assetId, specData);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `조달규격서_RFP_${specData?.title || assetId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('조달 규격서 PDF 다운로드 실패:', error);
      toast.error('PDF 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  const close = () => {
    setOpen(false);
    setSpecData(null);
    setAssetId(null);
  };

  return { open, loading, specData, downloading, generate, download, close };
}

export default function ProcurementSpecModal({ open, onClose, loading, specData, downloading, onDownload }) {
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-4xl">
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3 mb-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          📋 AI 조달 구매 규격서 & 제안요청서(RFP)
        </h2>
        <button
          onClick={onClose}
          className="text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:dark:text-slate-400 font-bold"
        >
          닫기
        </button>
      </div>

      {loading ? (
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
              onClick={onDownload}
              disabled={downloading}
              className="btn btn-primary flex items-center gap-1.5 disabled:opacity-60"
            >
              <Download size={14} />
              {downloading ? 'PDF 생성 중...' : '규격서/RFP PDF 다운로드'}
            </button>
            <button onClick={onClose} className="btn btn-secondary">
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

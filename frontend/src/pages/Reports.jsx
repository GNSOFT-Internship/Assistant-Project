import React from 'react';
import { reportApi } from '../services/api';
import { FileText, Download } from 'lucide-react';

export default function Reports() {
  const [generating, setGenerating] = React.useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await reportApi.generate();
      
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
      alert('보고서 생성 실패');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold mb-4">보고서 자동 생성</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="text-blue-600" size={32} />
              <h2 className="text-lg font-semibold">자산 관리 보고서</h2>
            </div>
            <ul className="space-y-2 text-sm text-gray-600 mb-6">
              <li>• 자산 현황 요약</li>
              <li>• 유지보수 비용 분석</li>
              <li>• 교체 권장 자산 목록</li>
              <li>• 문제점 및 개선사항</li>
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
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">총 자산 수</span>
                <span className="font-medium">25 개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">가동 중 자산</span>
                <span className="font-medium">20 개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">교체 필요 자산</span>
                <span className="font-medium text-red-600">5 개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">총 유지보수 비용</span>
                <span className="font-medium">₩3,850,000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">평균 유지보수 비용</span>
                <span className="font-medium">₩127,833</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import { fileApi } from '../services/api';
import { Upload, FileText, CheckCircle, XCircle, Loader, Play, Download } from 'lucide-react';

export default function FileUpload() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const response = await fileApi.getAll();
      setFiles(response.data.data || []);
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fileApi.upload(formData);
      if (response.data) {
        loadFiles();
      }
    } catch (error) {
      console.error('업로드 실패:', error);
      alert('파일 업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async (id) => {
    try {
      await fileApi.process(id);
      loadFiles();
    } catch (error) {
      console.error('분석 실패:', error);
      alert('파일 분석 실패');
    }
  };

  const handleApply = async (id) => {
    if (!confirm('적용하시겠습니까?')) return;
    try {
      await fileApi.apply(id);
      loadFiles();
    } catch (error) {
      console.error('적용 실패:', error);
      alert('파일 적용 실패');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      await fileApi.delete(id);
      loadFiles();
    } catch (error) {
      console.error('삭제 실패:', error);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">대기</span>;
      case 'PROCESSING':
        return <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">분석중</span>;
      case 'COMPLETED':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">완료</span>;
      case 'FAILED':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">실패</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold mb-4">파일 업로드 및 AI 분석</h1>
        
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            onChange={handleUpload}
            className="hidden"
          />
          
          <Upload className="mx-auto text-gray-400 mb-4" size={48} />
          <div className="text-gray-600 mb-4">
            유지보수 내역서 (엑셀/CSV) 나 수리 견적서 (PDF) 를 업로드하세요.
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn btn-primary flex items-center gap-2 mx-auto"
          >
            <Upload size={16} />
            {uploading ? '업로드 중...' : '파일 선택'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">업로드된 파일</h2>
        
        {files.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            업로드된 파일이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            {files.map((file) => (
              <div key={file.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="text-blue-600" size={20} />
                    <div>
                      <div className="font-medium">{file.originalFilename}</div>
                      <div className="text-sm text-gray-500">{file.fileType}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(file.status)}
                    {file.applied && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                        적용됨
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 mt-3">
                  {file.status === 'PENDING' && (
                    <button
                      onClick={() => handleProcess(file.id)}
                      className="btn btn-secondary flex items-center gap-2"
                    >
                      <Play size={14} /> 분석
                    </button>
                  )}
                  {file.status === 'COMPLETED' && !file.applied && (
                    <button
                      onClick={() => handleApply(file.id)}
                      className="btn btn-primary flex items-center gap-2"
                    >
                      <CheckCircle size={14} /> 적용
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="btn btn-danger flex items-center gap-2"
                  >
                    <XCircle size={14} /> 삭제
                  </button>
                </div>
                
                {file.status === 'FAILED' && file.errorMessage && (
                  <div className="mt-2 text-sm text-red-600">
                    오류: {file.errorMessage}
                  </div>
                )}

                {file.extractedSummary?.kind === 'maintenance_records' && (
                  <div className="mt-3 bg-gray-50 rounded p-3 text-sm space-y-1">
                    <div>총 {file.extractedSummary.totalRows}행 중 유효 {file.extractedSummary.validRows}행, 오류 {file.extractedSummary.errorRowCount}행</div>
                    {file.extractedSummary.unmatchedAssetCodes?.length > 0 && (
                      <div className="text-yellow-700">
                        일치하는 자산이 없는 코드: {file.extractedSummary.unmatchedAssetCodes.join(', ')}
                      </div>
                    )}
                    {file.applied && (
                      <div className="text-green-700 font-medium">
                        등록된 유지보수 기록: {file.extractedSummary.appliedRecordCount ?? 0}건
                      </div>
                    )}
                  </div>
                )}

                {file.extractedSummary?.kind === 'pdf_text' && (
                  <div className="mt-3 bg-gray-50 rounded p-3 text-sm">
                    <div className="text-gray-500 mb-1">추출된 텍스트 ({file.extractedSummary.characterCount}자) 미리보기:</div>
                    <pre className="whitespace-pre-wrap text-xs text-gray-700">{file.extractedSummary.preview}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
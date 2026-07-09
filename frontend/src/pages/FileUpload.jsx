import React, { useState, useEffect, useRef } from 'react';
import { fileApi } from '../services/api';
import { Upload, FileText, CheckCircle, XCircle, Loader, Play, Download } from 'lucide-react';
import { FileStatusBadge } from '../components/StatusBadge';

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

  const handleUnapply = async (id) => {
    if (!confirm('적용을 취소하면 이 파일로 등록된 유지보수 기록이 모두 삭제됩니다. 계속할까요?')) return;
    try {
      const response = await fileApi.unapply(id);
      alert(response.data.message);
      loadFiles();
    } catch (error) {
      console.error('적용 취소 실패:', error);
      alert('적용 취소 실패');
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
                    <FileStatusBadge status={file.status} />
                    {file.applied && <span className="badge-blue">적용됨</span>}
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
                  {file.applied && (
                    <button
                      onClick={() => handleUnapply(file.id)}
                      className="btn btn-secondary flex items-center gap-2"
                    >
                      <XCircle size={14} /> 적용 취소
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

                    {file.extractedSummary.records?.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-gray-500 cursor-pointer">
                          행별 미리보기 ({file.extractedSummary.records.length}행)
                        </summary>
                        <div className="mt-2 overflow-x-auto">
                          <table className="table text-xs">
                            <thead className="table-header">
                              <tr>
                                <th className="table-cell">행</th>
                                <th className="table-cell">자산코드</th>
                                <th className="table-cell">일치여부</th>
                                <th className="table-cell">정비일</th>
                                <th className="table-cell">유형</th>
                                <th className="table-cell">비용</th>
                                <th className="table-cell">설명</th>
                              </tr>
                            </thead>
                            <tbody>
                              {file.extractedSummary.records.map((r) => (
                                <tr key={r.row} className={r.assetExists ? '' : 'bg-yellow-50'}>
                                  <td className="table-cell">{r.row}</td>
                                  <td className="table-cell">{r.assetCode}</td>
                                  <td className="table-cell">
                                    {r.assetExists
                                      ? <span className="text-green-700">일치</span>
                                      : <span className="text-yellow-700">불일치</span>}
                                  </td>
                                  <td className="table-cell">{r.maintenanceDate}</td>
                                  <td className="table-cell">{r.maintenanceType}</td>
                                  <td className="table-cell">{r.cost != null ? r.cost.toLocaleString() : '-'}</td>
                                  <td className="table-cell">{r.description || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}

                    {file.extractedSummary.errorRows?.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-red-600 cursor-pointer">
                          오류 행 ({file.extractedSummary.errorRows.length}행)
                        </summary>
                        <ul className="mt-1 list-disc list-inside text-red-600">
                          {file.extractedSummary.errorRows.map((e, i) => (
                            <li key={i}>{e.row}행: {e.reason}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}

                {file.extractedSummary?.kind === 'pdf_quote' && (
                  <div className="mt-3 bg-gray-50 rounded p-3 text-sm space-y-1">
                    <div>
                      자산코드: {file.extractedSummary.assetCode || '인식 안 됨'}
                      {file.extractedSummary.assetCode && (
                        <span className={file.extractedSummary.assetExists ? 'text-green-700' : 'text-yellow-700'}>
                          {' '}({file.extractedSummary.assetExists ? '자산 일치' : '일치하는 자산 없음'})
                        </span>
                      )}
                    </div>
                    <div>업체: {file.extractedSummary.vendor || '인식 안 됨'}</div>
                    <div>견적일자: {file.extractedSummary.quoteDate || '인식 안 됨'}</div>
                    <div>총 금액: {file.extractedSummary.totalAmount != null ? `${file.extractedSummary.totalAmount.toLocaleString()}원` : '인식 안 됨'}</div>
                    {file.applied && (
                      <div className={file.extractedSummary.appliedRecordCount ? 'text-green-700 font-medium' : 'text-yellow-700'}>
                        {file.extractedSummary.appliedRecordCount ? '유지보수 기록으로 등록됨' : '자동 등록 실패 (자산코드/금액 인식 불가)'}
                      </div>
                    )}
                    <details className="mt-1">
                      <summary className="text-gray-500 cursor-pointer">추출된 텍스트 전체 보기</summary>
                      <pre className="whitespace-pre-wrap text-xs text-gray-700 mt-1">{file.extractedSummary.preview}</pre>
                    </details>
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
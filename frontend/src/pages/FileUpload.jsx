import React, { useState, useEffect, useRef } from 'react';
import { fileApi } from '../services/api';
import { Upload, FileText, CheckCircle, XCircle, Loader, Play, Download } from 'lucide-react';
import { FileStatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

export default function FileUpload() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadFiles();
  }, []);

  // 대기(PENDING) 또는 처리 중(PROCESSING) 상태인 파일이 있는 경우 2초 주기로 상태 폴링
  useEffect(() => {
    const hasActiveTasks = files.some(
      (f) => f.status === 'PENDING' || f.status === 'PROCESSING'
    );

    if (hasActiveTasks) {
      const interval = setInterval(() => {
        loadFiles();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [files]);

  const loadFiles = async () => {
    try {
      const response = await fileApi.getAll();
      setFiles(response.data.data || []);
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
    }
  };

  const handleUpload = async (e) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    await uploadFilesBatch(uploadedFiles);
  };

  const uploadFilesBatch = async (fileList) => {
    setUploading(true);
    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      formData.append('files', fileList[i]);
    }

    try {
      await fileApi.batchUpload(formData);
      loadFiles();
    } catch (error) {
      console.error('업로드 실패:', error);
      alert('파일 대량 업로드 및 비동기 배치 등록 실패');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFilesBatch(e.dataTransfer.files);
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

  const handleBatchApply = async () => {
    const applicableIds = files
      .filter((f) => f.status === 'COMPLETED' && !f.applied)
      .map((f) => f.id);

    if (applicableIds.length === 0) {
      alert('일괄 적용 가능한 분석 완료 파일이 없습니다.');
      return;
    }

    if (!confirm(`선택한 ${applicableIds.length}개 파일의 분석 데이터를 DB에 일괄 적용하시겠습니까?`)) return;

    setApplyingAll(true);
    try {
      await fileApi.batchApply(applicableIds);
      alert('일괄 적용이 완료되었습니다.');
      loadFiles();
    } catch (error) {
      console.error('일괄 적용 실패:', error);
      alert('일괄 적용 중 오류가 발생했습니다.');
    } finally {
      setApplyingAll(false);
    }
  };

  const handleBatchDelete = async () => {
    const deletableFiles = files.filter((f) => !f.applied);
    if (deletableFiles.length === 0) {
      alert('삭제할 수 있는 미적용 파일이 없습니다.');
      return;
    }

    if (!confirm(`아직 DB에 적용되지 않은 ${deletableFiles.length}개 파일을 모두 삭제하시겠습니까?`)) return;

    try {
      await Promise.all(deletableFiles.map((f) => fileApi.delete(f.id)));
      loadFiles();
    } catch (error) {
      console.error('일괄 삭제 실패:', error);
      alert('일괄 삭제 중 일부 파일이 실패했습니다.');
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

        {isAdmin ? (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
              dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,.pdf"
              onChange={handleUpload}
              className="hidden"
            />

            <Upload className={`mx-auto mb-4 transition-colors ${dragActive ? "text-blue-500 animate-bounce" : "text-gray-400"}`} size={48} />
            <div className="text-gray-600 mb-2 font-medium">
              유지보수 내역서(엑셀) 또는 견적서(PDF)들을 이곳에 마우스로 끌어다 놓으세요.
            </div>
            <div className="text-sm text-gray-400 mb-4">
              동시 업로드 및 백그라운드 비동기 대량 배치 분석을 완벽하게 지원합니다.
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn btn-primary flex items-center gap-2 mx-auto"
            >
              <Upload size={16} />
              {uploading ? '파일 업로드 중...' : '컴퓨터에서 파일 선택'}
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-4">
            파일 업로드는 관리자만 가능합니다. 아래에서 업로드된 파일을 조회할 수 있습니다.
          </div>
        )}
      </div>

      {/* 배치 대시보드 요약 현황판 */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="card text-center p-4 bg-gray-50 border border-gray-200">
            <div className="text-2xl font-bold text-gray-800">{files.length}건</div>
            <div className="text-xs text-gray-500 font-medium mt-1">총 업로드</div>
          </div>
          <div className="card text-center p-4 bg-yellow-50 border border-yellow-100">
            <div className="text-2xl font-bold text-yellow-700 flex items-center justify-center gap-1">
              {files.filter(f => f.status === 'PROCESSING' || f.status === 'PENDING').length > 0 && (
                <Loader className="animate-spin text-yellow-600" size={20} />
              )}
              {files.filter(f => f.status === 'PROCESSING' || f.status === 'PENDING').length}건
            </div>
            <div className="text-xs text-yellow-600 font-medium mt-1">분석 중</div>
          </div>
          <div className="card text-center p-4 bg-green-50 border border-green-100">
            <div className="text-2xl font-bold text-green-700">
              {files.filter(f => f.status === 'COMPLETED' && !f.applied).length}건
            </div>
            <div className="text-xs text-green-600 font-medium mt-1">분석 완료 (미적용)</div>
          </div>
          <div className="card text-center p-4 bg-blue-50 border border-blue-100">
            <div className="text-2xl font-bold text-blue-700">
              {files.filter(f => f.applied).length}건
            </div>
            <div className="text-xs text-blue-600 font-medium mt-1">DB 적용 완료</div>
          </div>
          <div className="card text-center p-4 bg-red-50 border border-red-100 col-span-2 md:col-span-1">
            <div className="text-2xl font-bold text-red-700">
              {files.filter(f => f.status === 'FAILED').length}건
            </div>
            <div className="text-xs text-red-600 font-medium mt-1">분석 실패</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">업로드된 파일 및 배치 작업</h2>
          {isAdmin && files.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={handleBatchApply}
                disabled={applyingAll || files.filter(f => f.status === 'COMPLETED' && !f.applied).length === 0}
                className="btn btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
              >
                <CheckCircle size={14} />
                {applyingAll ? '일괄 적용 중...' : '완료 파일 일괄 적용'}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={files.filter(f => !f.applied).length === 0}
                className="btn btn-danger text-xs py-1.5 px-3 flex items-center gap-1"
              >
                <XCircle size={14} />
                미적용 일괄 삭제
              </button>
            </div>
          )}
        </div>
        
        {files.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            업로드된 파일이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            {files.map((file) => (
              <div key={file.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="text-blue-600 flex-shrink-0" size={20} />
                    <div className="min-w-0">
                      <div className="font-medium break-all">{file.originalFilename}</div>
                      <div className="text-sm text-gray-500">{file.fileType}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <FileStatusBadge status={file.status} />
                    {file.applied && <span className="badge-blue">적용됨</span>}
                  </div>
                </div>
                
                {isAdmin && (
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
                )}
                
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
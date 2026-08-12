import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetApi, fileApi } from '../services/api';
import {
  Plus, Edit, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, Upload, ArrowUp, ArrowDown, ArrowUpDown,
  FileText, CheckCircle, XCircle, Loader, Play,
} from 'lucide-react';
import { AssetStatusBadge, FileStatusBadge } from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import Modal from '../components/Modal';
import Dropdown from '../components/Dropdown';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

const PAGE_SIZE = 20;
const DOC_PAGE_SIZE = 5;

export default function Assets() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const isAdmin = user?.role === 'ADMIN';
  const [assets, setAssets] = useState([]);
  // category는 자유 문자열 컬럼이라 엑셀 일괄 등록으로 임의의 값이 들어올 수 있으므로,
  // 필터/등록 폼에 쓰는 카테고리 목록은 하드코딩하지 않고 실제 DB에 있는 값을 가져온다.
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const templateMenuRef = useRef(null);

  // 신규 자산 등록용 엑셀과 기존 자산의 유지보수 내역서(엑셀)/견적서(PDF)는 원래
  // 서로 다른 업로드 입구(상단 "엑셀 일괄 등록" 버튼 vs 이 드롭존)를 썼지만, 두 기능이
  // 헷갈린다는 피드백에 따라 이 드롭존 하나로 합쳤다. 어떤 파일인지는 서버가 컬럼
  // 구성을 보고 자동으로 판별한다(자산번호+자산명/카테고리/... vs 자산번호+정비일).
  const [docFiles, setDocFiles] = useState([]);
  // 서버 응답(업로드+분석 완료)을 기다리지 않고, 파일을 고른 즉시 "뭘 선택했는지"
  // 바로 보여주기 위한 임시 목록. 업로드 요청이 끝나면(성공/실패 무관) 비우고,
  // 이후로는 서버가 내려주는 진짜 docFiles 목록이 그 자리를 대신한다.
  const [pendingUploadFiles, setPendingUploadFiles] = useState([]);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [applyingAllDocs, setApplyingAllDocs] = useState(false);
  const [docDragActive, setDocDragActive] = useState(false);
  const [docPendingIds, setDocPendingIds] = useState(new Set());
  const [docPage, setDocPage] = useState(1);
  const [expandedDocFileIds, setExpandedDocFileIds] = useState(new Set());
  const docFileInputRef = useRef(null);

  const toggleDocFileExpanded = (id) => {
    setExpandedDocFileIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // 요약 테이블의 "요약" 열에 파일 종류별로 핵심 정보 한 줄만 보여주기 위한 헬퍼.
  // 상세 내용(행별 미리보기 등)은 행을 펼쳤을 때만 렌더링한다.
  const getDocFileSummaryText = (file) => {
    const s = file.extractedSummary;
    if (!s) return '-';
    if (s.kind === 'asset_registration' || s.kind === 'maintenance_records') {
      return `총 ${s.totalRows}행 · 유효 ${s.validRows}행 · 오류 ${s.errorRowCount}행`;
    }
    if (s.kind === 'pdf_quote') {
      return `${s.vendor || '업체 미상'} · ${s.totalAmount != null ? `${s.totalAmount.toLocaleString()}원` : '금액 미상'}`;
    }
    return '-';
  };

  const [formData, setFormData] = useState({
    assetName: '', category: '', location: '',
    responsiblePerson: '', purchaseDate: '', purchasePrice: '',
    usefulLife: 5, status: 'ACTIVE', description: ''
  });

  // 검색어 입력을 400ms 디바운스해서 서버 요청을 과도하게 보내지 않도록 함
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter]);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await assetApi.getAll({
        page,
        pageSize: PAGE_SIZE,
        search: searchTerm,
        category: categoryFilter,
        sortBy,
        sortOrder,
      });
      const data = response.data.data;
      setAssets(data.items || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('자산 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, categoryFilter, sortBy, sortOrder]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <ArrowUpDown size={12} className="text-gray-300 dark:text-slate-600" />;
    return sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    assetApi.getCategories()
      .then((response) => setCategories(response.data.data || []))
      .catch((error) => console.error('카테고리 목록 로드 실패:', error));
  }, []);

  useEffect(() => {
    if (!showTemplateMenu) return;
    const handleClickOutside = (e) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target)) {
        setShowTemplateMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTemplateMenu]);

  const withDocPending = async (id, fn) => {
    if (docPendingIds.has(id)) return;
    setDocPendingIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setDocPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const loadDocFiles = useCallback(async () => {
    try {
      const response = await fileApi.getAll();
      setDocFiles(response.data.data || []);
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    loadDocFiles();
  }, [loadDocFiles]);

  // 대기(PENDING) 또는 처리 중(PROCESSING) 상태인 파일이 있는 경우 2초 주기로 상태 폴링
  useEffect(() => {
    const hasActiveTasks = docFiles.some(
      (f) => f.status === 'PENDING' || f.status === 'PROCESSING'
    );

    if (hasActiveTasks) {
      const interval = setInterval(() => {
        loadDocFiles();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [docFiles, loadDocFiles]);

  const handleDocUpload = async (e) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    await uploadDocFilesBatch(uploadedFiles);
  };

  const uploadDocFilesBatch = async (fileList) => {
    setPendingUploadFiles(Array.from(fileList).map((f) => ({ name: f.name, size: f.size })));
    setUploadingDocs(true);
    const uploadFormData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      uploadFormData.append('files', fileList[i]);
    }

    try {
      await fileApi.batchUpload(uploadFormData);
      await loadDocFiles();
    } catch (error) {
      console.error('업로드 실패:', error);
      toast.error('파일 대량 업로드 및 비동기 배치 등록 실패');
    } finally {
      setUploadingDocs(false);
      setPendingUploadFiles([]);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
    }
  };

  const handleDocDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDocDragActive(true);
    } else if (e.type === 'dragleave') {
      setDocDragActive(false);
    }
  };

  const handleDocDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDocDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadDocFilesBatch(e.dataTransfer.files);
    }
  };

  // 분석은 끝났지만(COMPLETED) 실제로 적용했을 때 아무것도 생성되지 않는 파일(유지보수/
  // 견적서는 일치하는 자산이 하나도 없는 경우)은 적용 버튼을 눌러도 0건으로 끝나 헷갈리므로,
  // 애초에 적용 버튼을 숨긴다. 자산 등록은 자산번호가 자동 채번이라 항상 신규 생성된다.
  const fileHasApplicableRows = (file) => {
    const summary = file.extractedSummary;
    if (!summary) return true;
    if (summary.kind === 'asset_registration') {
      return (summary.rows || []).length > 0;
    }
    if (summary.kind === 'maintenance_records') {
      return (summary.records || []).some((r) => r.assetExists);
    }
    if (summary.kind === 'pdf_quote') {
      return Boolean(summary.assetCode && summary.assetExists && summary.totalAmount != null);
    }
    return true;
  };

  const handleDocProcess = (id) => withDocPending(id, async () => {
    try {
      await fileApi.process(id);
      loadDocFiles();
    } catch (error) {
      console.error('분석 실패:', error);
      toast.error(error.response?.data?.detail || '파일 분석 실패');
    }
  });

  const handleDocApply = async (id) => {
    if (!(await confirmDialog('적용하시겠습니까?'))) return;
    await withDocPending(id, async () => {
      try {
        await fileApi.apply(id);
        loadDocFiles();
        loadAssets();
      } catch (error) {
        console.error('적용 실패:', error);
        toast.error(error.response?.data?.detail || '파일 적용 실패');
      }
    });
  };

  const handleDocBatchApply = async () => {
    const applicableIds = docFiles
      .filter((f) => f.status === 'COMPLETED' && !f.applied && fileHasApplicableRows(f))
      .map((f) => f.id);

    if (applicableIds.length === 0) {
      toast.error('일괄 적용 가능한 분석 완료 파일이 없습니다.');
      return;
    }

    if (!(await confirmDialog(`선택한 ${applicableIds.length}개 파일의 분석 데이터를 DB에 일괄 적용하시겠습니까?`))) return;

    setApplyingAllDocs(true);
    try {
      await fileApi.batchApply(applicableIds);
      toast.success('일괄 적용이 완료되었습니다.');
      loadDocFiles();
      loadAssets();
    } catch (error) {
      console.error('일괄 적용 실패:', error);
      toast.error('일괄 적용 중 오류가 발생했습니다.');
    } finally {
      setApplyingAllDocs(false);
    }
  };

  const handleDocBatchDelete = async () => {
    const deletableFiles = docFiles.filter((f) => !f.applied);
    if (deletableFiles.length === 0) {
      toast.error('삭제할 수 있는 미적용 파일이 없습니다.');
      return;
    }

    if (!(await confirmDialog(`아직 DB에 적용되지 않은 ${deletableFiles.length}개 파일을 모두 삭제하시겠습니까?`, { danger: true, confirmLabel: '삭제' }))) return;

    try {
      await Promise.all(deletableFiles.map((f) => fileApi.delete(f.id)));
      loadDocFiles();
    } catch (error) {
      console.error('일괄 삭제 실패:', error);
      toast.error('일괄 삭제 중 일부 파일이 실패했습니다.');
    }
  };

  const handleDocUnapply = async (id) => {
    if (!(await confirmDialog('적용을 취소하면 이 파일로 등록된 유지보수 기록이 모두 삭제됩니다. 계속할까요?', { danger: true, confirmLabel: '적용 취소' }))) return;
    await withDocPending(id, async () => {
      try {
        const response = await fileApi.unapply(id);
        toast.success(response.data.message);
        loadDocFiles();
      } catch (error) {
        console.error('적용 취소 실패:', error);
        toast.error(error.response?.data?.detail || '적용 취소 실패');
      }
    });
  };

  const handleDocDelete = async (id) => {
    if (!(await confirmDialog('삭제하시겠습니까?', { danger: true, confirmLabel: '삭제' }))) return;
    try {
      await fileApi.delete(id);
      loadDocFiles();
    } catch (error) {
      console.error('삭제 실패:', error);
      toast.error('삭제 중 오류가 발생했습니다.');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const docTotalPages = Math.max(1, Math.ceil(docFiles.length / DOC_PAGE_SIZE));
  // 최신 업로드일수록 위쪽에 보이도록 id(자동 증가) 내림차순으로 정렬한다.
  const sortedDocFiles = [...docFiles].sort((a, b) => b.id - a.id);
  const pagedDocFiles = sortedDocFiles.slice((docPage - 1) * DOC_PAGE_SIZE, docPage * DOC_PAGE_SIZE);

  // 파일이 삭제되는 등으로 목록이 줄어들어 지금 페이지가 더 이상 존재하지 않게 되면
  // 마지막 페이지로 당겨준다 (빈 페이지가 표시되는 것을 방지).
  useEffect(() => {
    setDocPage((p) => Math.min(p, docTotalPages));
  }, [docTotalPages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAsset) {
        await assetApi.update(editingAsset.id, formData);
      } else {
        await assetApi.create(formData);
      }
      setShowModal(false);
      loadAssets();
      // 새 카테고리를 직접 입력했을 수 있으므로, 필터/자동완성 목록에도 반영되도록 다시 불러온다.
      assetApi.getCategories()
        .then((response) => setCategories(response.data.data || []))
        .catch((error) => console.error('카테고리 목록 로드 실패:', error));
      resetForm();
    } catch (error) {
      console.error('저장 실패:', error);
      toast.error('저장 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog('정말 삭제하시겠습니까?', { danger: true, confirmLabel: '삭제' }))) return;
    try {
      await assetApi.delete(id);
      loadAssets();
    } catch (error) {
      console.error('삭제 실패:', error);
      toast.error('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleEdit = (asset) => {
    setEditingAsset(asset);
    setFormData({
      assetName: asset.assetName || '',
      category: asset.category || '',
      location: asset.location || '',
      responsiblePerson: asset.responsiblePerson || '',
      purchaseDate: asset.purchaseDate ? asset.purchaseDate.split('T')[0] : '',
      purchasePrice: asset.purchasePrice || '',
      usefulLife: asset.usefulLife || 5,
      status: asset.status || 'ACTIVE',
      description: asset.description || ''
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingAsset(null);
    setFormData({
      assetName: '', category: '', location: '',
      responsiblePerson: '', purchaseDate: '', purchasePrice: '',
      usefulLife: 5, status: 'ACTIVE', description: ''
    });
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await assetApi.exportExcel({ search: searchTerm, category: categoryFilter, sortBy, sortOrder });
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `자산목록_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('자산 목록 내보내기 실패:', error);
      toast.error('엑셀 내보내기 중 오류가 발생했습니다.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-2xl font-bold">자산 관리</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Download size={16} /> {exporting ? '내보내는 중...' : '엑셀 내보내기'}
          </button>
          {isAdmin && (
            <div className="relative" ref={templateMenuRef}>
              <button
                onClick={() => setShowTemplateMenu((v) => !v)}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Download size={16} /> 예시 파일
              </button>
              {showTemplateMenu && (
                <div className="absolute top-full mt-2 right-0 z-40 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg py-1">
                  <a
                    href="/templates/자산등록_예시.xlsx"
                    download
                    onClick={() => setShowTemplateMenu(false)}
                    className="block px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 hover:dark:bg-slate-900"
                  >
                    자산 등록 예시 엑셀
                  </a>
                  <a
                    href="/templates/유지보수내역서_예시.xlsx"
                    download
                    onClick={() => setShowTemplateMenu(false)}
                    className="block px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 hover:dark:bg-slate-900"
                  >
                    유지보수 내역서 예시 엑셀 (정상+불일치 혼합)
                  </a>
                  <a
                    href="/templates/유지보수내역서_전체불일치_예시.xlsx"
                    download
                    onClick={() => setShowTemplateMenu(false)}
                    className="block px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 hover:dark:bg-slate-900"
                  >
                    유지보수 내역서 예시 엑셀 (전체 불일치)
                  </a>
                  <a
                    href="/templates/유지보수내역서_오류행포함_예시.xlsx"
                    download
                    onClick={() => setShowTemplateMenu(false)}
                    className="block px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 hover:dark:bg-slate-900"
                  >
                    유지보수 내역서 예시 엑셀 (오류 행 포함)
                  </a>
                </div>
              )}
            </div>
          )}
          {isAdmin && (
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> 자산 등록
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[3fr_2fr] gap-6 items-start">
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <input
            type="text"
            placeholder="자산명 검색..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input flex-1"
          />
          <Dropdown
            id="asset-category-filter"
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v)}
            widthClass="sm:w-40"
            options={[{ value: '', label: '전체 카테고리' }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        </div>

        {loading ? (
          <LoadingState className="py-8" />
        ) : assets.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-slate-400 py-8">일치하는 자산이 없습니다.</div>
        ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead className="table-header">
              <tr>
                <th className="table-cell cursor-pointer select-none" onClick={() => handleSort('assetName')}>
                  <span className="flex items-center gap-1">자산명 <SortIcon column="assetName" /></span>
                </th>
                <th className="table-cell">카테고리</th>
                <th className="table-cell">위치</th>
                <th className="table-cell cursor-pointer select-none" onClick={() => handleSort('purchaseDate')}>
                  <span className="flex items-center gap-1">구매일 <SortIcon column="purchaseDate" /></span>
                </th>
                <th className="table-cell cursor-pointer select-none" onClick={() => handleSort('purchasePrice')}>
                  <span className="flex items-center gap-1">구매가 <SortIcon column="purchasePrice" /></span>
                </th>
                <th className="table-cell cursor-pointer select-none" onClick={() => handleSort('status')}>
                  <span className="flex items-center gap-1">상태 <SortIcon column="status" /></span>
                </th>
                <th className="table-cell">관리</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr
                  key={asset.id}
                  className="border-t cursor-pointer hover:bg-gray-50 hover:dark:bg-slate-900"
                  onClick={() => navigate(`/assets/${asset.id}`)}
                >
                  <td className="table-cell font-medium">{asset.assetName}</td>
                  <td className="table-cell">{asset.category}</td>
                  <td className="table-cell">{asset.location}</td>
                  <td className="table-cell">{asset.purchaseDate?.split('T')[0]}</td>
                  <td className="table-cell">{asset.purchasePrice?.toLocaleString()}원</td>
                  <td className="table-cell">
                    <AssetStatusBadge status={asset.status} />
                  </td>
                  <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleEdit(asset)}
                          className="p-2 hover:bg-gray-100 hover:dark:bg-slate-700 rounded"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(asset.id)}
                          className="p-2 hover:bg-red-100 hover:dark:bg-red-500/15 rounded text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {!loading && total > 0 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-slate-400">
            <div>전체 {total}건 중 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)}건</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="이전 페이지"
                className="btn btn-secondary px-2 py-1 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span>{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="다음 페이지"
                className="btn btn-secondary px-2 py-1 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">파일 업로드 (자산 등록 / 유지보수 내역서 · 견적서, AI 분석)</h2>

        {isAdmin ? (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
              docDragActive ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" : "border-gray-300 dark:border-slate-600"
            }`}
            onDragEnter={handleDocDrag}
            onDragLeave={handleDocDrag}
            onDragOver={handleDocDrag}
            onDrop={handleDocDrop}
          >
            <input
              ref={docFileInputRef}
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,.pdf"
              onChange={handleDocUpload}
              className="hidden"
            />

            <Upload className={`mx-auto mb-4 transition-colors ${docDragActive ? "text-blue-500 animate-bounce" : "text-gray-400 dark:text-slate-500"}`} size={48} />
            <div className="text-gray-600 dark:text-slate-400 mb-2 font-medium">
              신규 자산 등록용 엑셀, 또는 기존 자산의 유지보수 내역서(엑셀)·견적서(PDF)를 이곳에 끌어다 놓으세요.
            </div>
            <div className="text-sm text-gray-400 dark:text-slate-500 mb-4">
              파일 내용을 보고 자산 등록/유지보수 내역을 자동으로 구분합니다. 동시 업로드 및 백그라운드 비동기 대량 배치 분석을 지원합니다.
            </div>
            <button
              onClick={() => docFileInputRef.current?.click()}
              disabled={uploadingDocs}
              className="btn btn-primary flex items-center gap-2 mx-auto"
            >
              <Upload size={16} />
              {uploadingDocs ? '파일 업로드 중...' : '컴퓨터에서 파일 선택'}
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-500 dark:text-slate-400 py-4">
            파일 업로드는 관리자만 가능합니다. 아래에서 업로드된 파일을 조회할 수 있습니다.
          </div>
        )}

        {pendingUploadFiles.length > 0 && (
          <div className="mt-4 border rounded-lg p-3 bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20">
            <div className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
              <Loader className="animate-spin" size={14} />
              선택한 파일 {pendingUploadFiles.length}건 업로드 중...
            </div>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              {pendingUploadFiles.map((f, idx) => (
                <li key={idx} className="flex items-center gap-2 min-w-0">
                  <FileText size={14} className="flex-shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <span className="text-xs text-blue-400 dark:text-blue-500 flex-shrink-0">
                    ({(f.size / 1024).toFixed(0)}KB)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {docFiles.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
            <div className="card text-center p-4 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600">
              <div className="text-2xl font-bold text-gray-800 dark:text-slate-200">{docFiles.length}건</div>
              <div className="text-xs text-gray-500 dark:text-slate-400 font-medium mt-1">총 업로드</div>
            </div>
            <div className="card text-center p-4 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-100">
              <div className="text-2xl font-bold text-yellow-700 flex items-center justify-center gap-1">
                {docFiles.filter(f => f.status === 'PROCESSING' || f.status === 'PENDING').length > 0 && (
                  <Loader className="animate-spin text-yellow-600" size={20} />
                )}
                {docFiles.filter(f => f.status === 'PROCESSING' || f.status === 'PENDING').length}건
              </div>
              <div className="text-xs text-yellow-600 font-medium mt-1">분석 중</div>
            </div>
            <div className="card text-center p-4 bg-green-50 dark:bg-green-500/10 border border-green-100">
              <div className="text-2xl font-bold text-green-700">
                {docFiles.filter(f => f.status === 'COMPLETED' && !f.applied).length}건
              </div>
              <div className="text-xs text-green-600 font-medium mt-1">분석 완료 (미적용)</div>
            </div>
            <div className="card text-center p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-100">
              <div className="text-2xl font-bold text-blue-700">
                {docFiles.filter(f => f.applied).length}건
              </div>
              <div className="text-xs text-blue-600 font-medium mt-1">DB 적용 완료</div>
            </div>
            <div className="card text-center p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 col-span-2 md:col-span-1">
              <div className="text-2xl font-bold text-red-700">
                {docFiles.filter(f => f.status === 'FAILED').length}건
              </div>
              <div className="text-xs text-red-600 font-medium mt-1">분석 실패</div>
            </div>
          </div>
        )}

        <div className="mt-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h3 className="font-semibold">업로드된 파일 및 배치 작업</h3>
            {isAdmin && docFiles.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleDocBatchApply}
                  disabled={applyingAllDocs || docFiles.filter(f => f.status === 'COMPLETED' && !f.applied && fileHasApplicableRows(f)).length === 0}
                  className="btn btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                >
                  <CheckCircle size={14} />
                  {applyingAllDocs ? '일괄 적용 중...' : '완료 파일 일괄 적용'}
                </button>
                <button
                  onClick={handleDocBatchDelete}
                  disabled={docFiles.filter(f => !f.applied).length === 0}
                  className="btn btn-danger text-xs py-1.5 px-3 flex items-center gap-1"
                >
                  <XCircle size={14} />
                  미적용 일괄 삭제
                </button>
              </div>
            )}
          </div>

          {docFiles.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-slate-400 py-8">
              업로드된 파일이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table text-sm w-full">
                <thead className="table-header">
                  <tr>
                    <th className="table-cell">파일명</th>
                    <th className="table-cell">종류</th>
                    <th className="table-cell">상태</th>
                    <th className="table-cell">요약</th>
                    <th className="table-cell w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDocFiles.map((file) => {
                    const expanded = expandedDocFileIds.has(file.id);
                    return (
                      <React.Fragment key={file.id}>
                        <tr
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800"
                          onClick={() => toggleDocFileExpanded(file.id)}
                        >
                          <td className="table-cell">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="text-blue-600 flex-shrink-0" size={16} />
                              <span className="truncate max-w-[220px] inline-block align-middle" title={file.originalFilename}>
                                {file.originalFilename}
                              </span>
                            </div>
                          </td>
                          <td className="table-cell whitespace-nowrap">{file.fileType}</td>
                          <td className="table-cell whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <FileStatusBadge status={file.status} />
                              {file.applied && <span className="badge-blue">적용됨</span>}
                            </div>
                          </td>
                          <td className="table-cell text-gray-600 dark:text-slate-400 max-w-xs truncate" title={getDocFileSummaryText(file)}>
                            {getDocFileSummaryText(file)}
                          </td>
                          <td className="table-cell text-gray-400">
                            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={5} className="table-cell bg-gray-50 dark:bg-slate-900">
                  {isAdmin && (
                    <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      {file.status === 'PENDING' && (
                        <button
                          onClick={() => handleDocProcess(file.id)}
                          disabled={docPendingIds.has(file.id)}
                          className="btn btn-secondary flex items-center gap-2"
                        >
                          <Play size={14} /> 분석
                        </button>
                      )}
                      {file.status === 'COMPLETED' && !file.applied && (
                        fileHasApplicableRows(file) ? (
                          <button
                            onClick={() => handleDocApply(file.id)}
                            disabled={docPendingIds.has(file.id)}
                            className="btn btn-primary flex items-center gap-2"
                          >
                            <CheckCircle size={14} /> 적용
                          </button>
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-1 px-1">
                            <XCircle size={14} /> 적용 가능한 항목 없음
                          </span>
                        )
                      )}
                      {file.applied && file.extractedSummary?.kind !== 'asset_registration' && (
                        <button
                          onClick={() => handleDocUnapply(file.id)}
                          disabled={docPendingIds.has(file.id)}
                          className="btn btn-secondary flex items-center gap-2"
                        >
                          <XCircle size={14} /> 적용 취소
                        </button>
                      )}
                      <button
                        onClick={() => handleDocDelete(file.id)}
                        disabled={docPendingIds.has(file.id)}
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

                  {file.extractedSummary?.kind === 'asset_registration' && (
                    <div className="mt-3 bg-gray-50 dark:bg-slate-900 rounded p-3 text-sm space-y-1">
                      <div>총 {file.extractedSummary.totalRows}행 중 유효 {file.extractedSummary.validRows}행, 오류 {file.extractedSummary.errorRowCount}행</div>
                      {file.applied && (
                        <div className="text-green-700 font-medium">
                          등록된 자산: {file.extractedSummary.appliedAssetCount ?? 0}건
                        </div>
                      )}

                      {(file.extractedSummary.rows?.length > 0 || file.extractedSummary.errorRows?.length > 0) && (
                        <details className="mt-2">
                          <summary className="text-gray-500 dark:text-slate-400 cursor-pointer">
                            행별 미리보기 ({(file.extractedSummary.rows?.length || 0) + (file.extractedSummary.errorRows?.length || 0)}행, 오류 {file.extractedSummary.errorRows?.length || 0}행 포함)
                          </summary>
                          <div className="mt-2 overflow-x-auto">
                            <table className="table text-xs">
                              <thead className="table-header">
                                <tr>
                                  <th className="table-cell">행</th>
                                  <th className="table-cell">자산명</th>
                                  <th className="table-cell">카테고리</th>
                                  <th className="table-cell">상태</th>
                                  <th className="table-cell">비고</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  ...(file.extractedSummary.rows || []).map((r) => ({ ...r, isError: false })),
                                  ...(file.extractedSummary.errorRows || []).map((e) => ({ ...e, isError: true })),
                                ].sort((a, b) => a.row - b.row).map((r) => (
                                  <tr key={r.row} className={r.isError ? 'bg-red-50 dark:bg-red-500/10' : ''}>
                                    <td className="table-cell">{r.row}</td>
                                    <td className="table-cell">{r.isError ? '-' : r.assetName}</td>
                                    <td className="table-cell">{r.isError ? '-' : r.category}</td>
                                    <td className="table-cell">
                                      {r.isError
                                        ? <span className="text-red-700">오류</span>
                                        : <span className="text-green-700">신규</span>}
                                    </td>
                                    <td className="table-cell text-red-700">{r.isError ? r.error : ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </div>
                  )}

                  {file.extractedSummary?.kind === 'maintenance_records' && (
                    <div className="mt-3 bg-gray-50 dark:bg-slate-900 rounded p-3 text-sm space-y-1">
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

                      {(file.extractedSummary.records?.length > 0 || file.extractedSummary.errorRows?.length > 0) && (
                        <details className="mt-2">
                          <summary className="text-gray-500 dark:text-slate-400 cursor-pointer">
                            행별 미리보기 ({(file.extractedSummary.records?.length || 0) + (file.extractedSummary.errorRows?.length || 0)}행, 오류 {file.extractedSummary.errorRows?.length || 0}행 포함)
                          </summary>
                          <div className="mt-2 overflow-x-auto">
                            <table className="table text-xs">
                              <thead className="table-header">
                                <tr>
                                  <th className="table-cell">행</th>
                                  <th className="table-cell">자산번호</th>
                                  <th className="table-cell">일치여부</th>
                                  <th className="table-cell">정비일</th>
                                  <th className="table-cell">유형</th>
                                  <th className="table-cell">비용</th>
                                  <th className="table-cell">설명</th>
                                  <th className="table-cell">비고</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  ...(file.extractedSummary.records || []).map((r) => ({ ...r, isError: false })),
                                  ...(file.extractedSummary.errorRows || []).map((e) => ({ ...e, isError: true })),
                                ].sort((a, b) => a.row - b.row).map((r) => (
                                  <tr key={r.row} className={r.isError ? 'bg-red-50 dark:bg-red-500/10' : (r.assetExists ? '' : 'bg-yellow-50 dark:bg-yellow-500/10')}>
                                    <td className="table-cell">{r.row}</td>
                                    <td className="table-cell">{r.isError ? '-' : r.assetCode}</td>
                                    <td className="table-cell">
                                      {r.isError
                                        ? <span className="text-red-700">오류</span>
                                        : r.assetExists
                                          ? <span className="text-green-700">일치</span>
                                          : <span className="text-yellow-700">불일치</span>}
                                    </td>
                                    <td className="table-cell">{r.isError ? '-' : r.maintenanceDate}</td>
                                    <td className="table-cell">{r.isError ? '-' : r.maintenanceType}</td>
                                    <td className="table-cell">{r.isError ? '-' : (r.cost != null ? r.cost.toLocaleString() : '-')}</td>
                                    <td className="table-cell">{r.isError ? '-' : (r.description || '-')}</td>
                                    <td className="table-cell text-red-700">{r.isError ? r.reason : ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </div>
                  )}

                  {file.extractedSummary?.kind === 'pdf_quote' && (
                    <div className="mt-3 bg-gray-50 dark:bg-slate-900 rounded p-3 text-sm space-y-1">
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
                        <summary className="text-gray-500 dark:text-slate-400 cursor-pointer">추출된 텍스트 전체 보기</summary>
                        <pre className="whitespace-pre-wrap text-xs text-gray-700 dark:text-slate-300 mt-1">{file.extractedSummary.preview}</pre>
                      </details>
                    </div>
                  )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {docFiles.length > DOC_PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-slate-400">
              <div>
                전체 {docFiles.length}건 중 {(docPage - 1) * DOC_PAGE_SIZE + 1}-
                {Math.min(docPage * DOC_PAGE_SIZE, docFiles.length)}건
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDocPage((p) => Math.max(1, p - 1))}
                  disabled={docPage <= 1}
                  aria-label="업로드 파일 이전 페이지"
                  className="btn btn-secondary px-2 py-1 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span>{docPage} / {docTotalPages}</span>
                <button
                  onClick={() => setDocPage((p) => Math.min(docTotalPages, p + 1))}
                  disabled={docPage >= docTotalPages}
                  aria-label="업로드 파일 다음 페이지"
                  className="btn btn-secondary px-2 py-1 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      <Modal open={showModal} onClose={closeModal} maxWidth="max-w-2xl">
        <h2 className="text-xl font-bold mb-4">
          {editingAsset ? '자산 수정' : '자산 등록'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">자산명</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={formData.assetName}
                  onChange={(e) => setFormData({ ...formData, assetName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">카테고리</label>
                <input
                  type="text"
                  required
                  list="asset-category-options"
                  className="input"
                  placeholder="기존 카테고리를 선택하거나 새 카테고리를 입력하세요"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
                <datalist id="asset-category-options">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">위치</label>
                <input
                  type="text"
                  className="input"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">담당자</label>
                <input
                  type="text"
                  className="input"
                  value={formData.responsiblePerson}
                  onChange={(e) => setFormData({ ...formData, responsiblePerson: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">구매일</label>
                <input
                  type="date"
                  required
                  className="input"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">구매가 (원)</label>
                <input
                  type="number"
                  required
                  className="input"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">내용연수 (년)</label>
                <input
                  type="number"
                  required
                  className="input"
                  value={formData.usefulLife}
                  onChange={(e) => setFormData({ ...formData, usefulLife: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">상태</label>
                <select
                  className="input"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="ACTIVE">활성</option>
                  <option value="INACTIVE">비활성</option>
                  <option value="REPLACEMENT_NEEDED">교체 필요</option>
                  <option value="UNDER_MAINTENANCE">유지보수 중</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">설명</label>
                <textarea
                  className="input"
                  rows="3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-secondary"
                >
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
                  저장
                </button>
              </div>
        </form>
      </Modal>
    </div>
  );
}
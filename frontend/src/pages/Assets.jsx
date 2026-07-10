import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetApi } from '../services/api';
import { Plus, Edit, Trash2, Eye, ChevronLeft, ChevronRight, Download, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { AssetStatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 20;

export default function Assets() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [assets, setAssets] = useState([]);
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
  const [formData, setFormData] = useState({
    assetName: '', assetCode: '', category: '', location: '',
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
    if (sortBy !== column) return <ArrowUpDown size={12} className="text-gray-300" />;
    return sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      resetForm();
    } catch (error) {
      console.error('저장 실패:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await assetApi.delete(id);
      loadAssets();
    } catch (error) {
      console.error('삭제 실패:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleEdit = (asset) => {
    setEditingAsset(asset);
    setFormData({
      assetName: asset.assetName || '',
      assetCode: asset.assetCode || '',
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
      assetName: '', assetCode: '', category: '', location: '',
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
      alert('엑셀 내보내기 중 오류가 발생했습니다.');
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
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> 자산 등록
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <input
            type="text"
            placeholder="자산명/자산번호 검색..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input flex-1"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input sm:w-40"
          >
            <option value="">전체 카테고리</option>
            <option value="IT 장비">IT 장비</option>
            <option value="사무기기">사무기기</option>
            <option value="설비">설비</option>
            <option value="전기설비">전기설비</option>
            <option value="안전설비">안전설비</option>
            <option value="가구">가구</option>
            <option value="보안장비">보안장비</option>
            <option value="측정장비">측정장비</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-8">로딩 중...</div>
        ) : assets.length === 0 ? (
          <div className="text-center text-gray-500 py-8">일치하는 자산이 없습니다.</div>
        ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead className="table-header">
              <tr>
                <th className="table-cell cursor-pointer select-none" onClick={() => handleSort('assetName')}>
                  <span className="flex items-center gap-1">자산명 <SortIcon column="assetName" /></span>
                </th>
                <th className="table-cell cursor-pointer select-none" onClick={() => handleSort('assetCode')}>
                  <span className="flex items-center gap-1">자산번호 <SortIcon column="assetCode" /></span>
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
                  className="border-t cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/assets/${asset.id}`)}
                >
                  <td className="table-cell font-medium">{asset.assetName}</td>
                  <td className="table-cell">{asset.assetCode}</td>
                  <td className="table-cell">{asset.category}</td>
                  <td className="table-cell">{asset.location}</td>
                  <td className="table-cell">{asset.purchaseDate?.split('T')[0]}</td>
                  <td className="table-cell">{asset.purchasePrice?.toLocaleString()}원</td>
                  <td className="table-cell">
                    <AssetStatusBadge status={asset.status} />
                  </td>
                  <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/assets/${asset.id}`)}
                      className="p-2 hover:bg-gray-100 rounded"
                    >
                      <Eye size={16} />
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleEdit(asset)}
                          className="p-2 hover:bg-gray-100 rounded"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(asset.id)}
                          className="p-2 hover:bg-red-100 rounded text-red-600"
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
          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <div>전체 {total}건 중 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)}건</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-secondary px-2 py-1 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span>{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-secondary px-2 py-1 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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
                <label className="block text-sm font-medium mb-1">자산번호</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={formData.assetCode}
                  onChange={(e) => setFormData({ ...formData, assetCode: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">카테고리</label>
                <select
                  className="input"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="IT 장비">IT 장비</option>
                  <option value="사무기기">사무기기</option>
                  <option value="설비">설비</option>
                  <option value="전기설비">전기설비</option>
                  <option value="안전설비">안전설비</option>
                  <option value="가구">가구</option>
                  <option value="보안장비">보안장비</option>
                  <option value="측정장비">측정장비</option>
                </select>
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
          </div>
        </div>
      )}
    </div>
  );
}
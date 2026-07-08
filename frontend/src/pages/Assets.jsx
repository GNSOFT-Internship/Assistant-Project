import React, { useState, useEffect } from 'react';
import { assetApi } from '../services/api';
import { Plus, Edit, Trash2, Eye } from 'lucide-react';

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [filteredAssets, setFilteredAssets] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [formData, setFormData] = useState({
    assetName: '', assetCode: '', category: '', location: '',
    responsiblePerson: '', purchaseDate: '', purchasePrice: '',
    usefulLife: 5, status: 'ACTIVE', description: ''
  });

  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    let result = [...assets];
    
    if (searchTerm) {
      result = result.filter(a => 
        (a.assetName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.assetCode || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (categoryFilter) {
      result = result.filter(a => a.category === categoryFilter);
    }
    
    setFilteredAssets(result);
  }, [searchTerm, categoryFilter, assets]);

  const loadAssets = async () => {
    try {
      const response = await assetApi.getAll();
      setAssets(response.data.data);
    } catch (error) {
      console.error('자산 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) return <div className="card">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">자산 관리</h1>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={16} /> 자산 등록
        </button>
      </div>

      <div className="card">
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            placeholder="자산명/자산번호 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input flex-1"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input w-40"
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

        <div className="overflow-x-auto">
          <table className="table">
            <thead className="table-header">
              <tr>
                <th className="table-cell">자산명</th>
                <th className="table-cell">자산번호</th>
                <th className="table-cell">카테고리</th>
                <th className="table-cell">위치</th>
                <th className="table-cell">구매일</th>
                <th className="table-cell">구매가</th>
                <th className="table-cell">상태</th>
                <th className="table-cell">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => (
                <tr key={asset.id} className="border-t">
                  <td className="table-cell font-medium">{asset.assetName}</td>
                  <td className="table-cell">{asset.assetCode}</td>
                  <td className="table-cell">{asset.category}</td>
                  <td className="table-cell">{asset.location}</td>
                  <td className="table-cell">{asset.purchaseDate?.split('T')[0]}</td>
                  <td className="table-cell">{asset.purchasePrice?.toLocaleString()}원</td>
                  <td className="table-cell">
                    <span className={`px-2 py-1 rounded text-xs ${
                      asset.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                      asset.status === 'REPLACEMENT_NEEDED' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {asset.status}
                    </span>
                  </td>
                  <td className="table-cell">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
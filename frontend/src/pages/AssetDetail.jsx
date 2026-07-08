import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { assetApi } from '../services/api';
import { Calendar, DollarSign, Clock, MapPin, User, Package } from 'lucide-react';

export default function AssetDetail() {
  const { id } = useParams();
  const [asset, setAsset] = useState(null);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAsset();
    loadMaintenance();
  }, [id]);

  const loadAsset = async () => {
    try {
      const response = await assetApi.getById(id);
      setAsset(response.data.data);
    } catch (error) {
      console.error('자산 정보 로드 실패:', error);
    }
  };

  const loadMaintenance = async () => {
    try {
      const response = await assetApi.getMaintenanceHistory(id);
      setMaintenance(response.data.data);
    } catch (error) {
      console.error('유지보수 이력 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !asset) return <div className="card">로딩 중...</div>;

  const usageYears = asset.purchaseDate ? 
    Math.floor((new Date() - new Date(asset.purchaseDate)) / (1000 * 60 * 60 * 24 * 365)) : 0;

  const totalMaintenanceCost = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Link to="/assets" className="btn btn-secondary">목록으로</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h1 className="text-2xl font-bold mb-4">{asset.assetName}</h1>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-500">자산번호</div>
              <div className="font-medium">{asset.assetCode}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">카테고리</div>
              <div className="font-medium">{asset.category}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">위치</div>
              <div className="font-medium">{asset.location}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">담당자</div>
              <div className="font-medium">{asset.responsiblePerson}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">구매일</div>
              <div className="font-medium">{asset.purchaseDate?.split('T')[0]}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">구매가</div>
              <div className="font-medium">{asset.purchasePrice?.toLocaleString()}원</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">내용연수</div>
              <div className="font-medium">{asset.usefulLife}년</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">상태</div>
              <div className={`font-medium px-2 py-1 rounded ${
                asset.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                asset.status === 'REPLACEMENT_NEEDED' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {asset.status}
              </div>
            </div>
          </div>

          {asset.description && (
            <div className="border-t pt-4">
              <div className="text-sm text-gray-500 mb-1">설명</div>
              <div>{asset.description}</div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">요약</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Calendar className="text-blue-600" size={20} />
              <div>
                <div className="text-sm text-gray-500">사용기간</div>
                <div className="font-medium">{usageYears}년</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DollarSign className="text-green-600" size={20} />
              <div>
                <div className="text-sm text-gray-500">누적 수리비</div>
                <div className="font-medium">{totalMaintenanceCost.toLocaleString()}원</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="text-yellow-600" size={20} />
              <div>
                <div className="text-sm text-gray-500">잔여 내용연수</div>
                <div className="font-medium">{Math.max(0, asset.usefulLife - usageYears)}년</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Package className="text-purple-600" size={20} />
              <div>
                <div className="text-sm text-gray-500">유지보수 건수</div>
                <div className="font-medium">{maintenance.length}건</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">유지보수 이력</h3>
        
        {maintenance.length === 0 ? (
          <div className="text-center text-gray-500 py-8">유지보수 이력이 없습니다.</div>
        ) : (
          <div className="space-y-4">
            {maintenance.map((record, index) => (
              <div key={record.id} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{record.maintenanceType}</div>
                    <div className="text-sm text-gray-600">{record.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{record.cost?.toLocaleString()}원</div>
                    <div className="text-sm text-gray-500">{record.maintenanceDate?.split('T')[0]}</div>
                  </div>
                </div>
                {record.technician && (
                  <div className="text-sm text-gray-500 mt-1">기술자: {record.technician}</div>
                )}
                {record.failureType && (
                  <div className="text-sm text-red-600 mt-1">고장유형: {record.failureType}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
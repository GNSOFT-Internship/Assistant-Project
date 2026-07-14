import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { assetApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingState from '../components/LoadingState';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 30;

const ACTION_LABEL = {
  CREATE: '등록',
  UPDATE: '수정',
  DELETE: '삭제',
};

const ACTION_STYLE = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
};

function formatChanges(changes) {
  if (!changes) return '-';
  return Object.entries(changes)
    .map(([field, { old, new: next }]) => `${field}: ${old ?? '-'} → ${next ?? '-'}`)
    .join(', ');
}

export default function AuditLog() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await assetApi.getAuditLogs({
        page,
        pageSize: PAGE_SIZE,
        action: actionFilter,
        search,
      });
      const data = response.data.data;
      setLogs(data.items || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('감사 로그 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, search]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-2xl font-bold">활동 감사 로그</h1>
      </div>

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <input
            type="text"
            placeholder="자산명 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input flex-1"
          />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="input sm:w-40"
          >
            <option value="">전체 작업</option>
            <option value="CREATE">등록</option>
            <option value="UPDATE">수정</option>
            <option value="DELETE">삭제</option>
          </select>
        </div>

        {loading ? (
          <LoadingState className="py-8" />
        ) : logs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">기록이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead className="table-header">
                <tr>
                  <th className="table-cell">일시</th>
                  <th className="table-cell">작업자</th>
                  <th className="table-cell">작업</th>
                  <th className="table-cell">자산명</th>
                  <th className="table-cell">자산번호</th>
                  <th className="table-cell">변경 내용</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="table-cell whitespace-nowrap">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString('ko-KR') : '-'}
                    </td>
                    <td className="table-cell">{log.changedBy || '-'}</td>
                    <td className="table-cell">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_STYLE[log.action] || 'bg-gray-100 text-gray-700'}`}>
                        {ACTION_LABEL[log.action] || log.action}
                      </span>
                    </td>
                    <td className="table-cell">{log.assetName || '-'}</td>
                    <td className="table-cell">{log.assetCode || '-'}</td>
                    <td className="table-cell max-w-md truncate" title={formatChanges(log.changes)}>
                      {formatChanges(log.changes)}
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
    </div>
  );
}

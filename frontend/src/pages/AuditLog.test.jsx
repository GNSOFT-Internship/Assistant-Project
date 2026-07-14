import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AuditLog from './AuditLog';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { assetApi } from '../services/api';

vi.mock('../services/api', () => ({
  assetApi: { getAuditLogs: vi.fn() },
}));

function seedAdmin() {
  localStorage.setItem('auth_user', JSON.stringify({ token: 't', username: 'admin', role: 'ADMIN' }));
}

function seedUser() {
  localStorage.setItem('auth_user', JSON.stringify({ token: 't', username: 'user', role: 'USER' }));
}

// 실제 앱에서는 App.jsx의 RequireAuth가 AuthProvider의 localStorage 로딩이
// 끝날 때까지 페이지 자체를 마운트하지 않는다. 이 가드가 없으면 user가 아직
// null인 첫 렌더에서 곧바로 <Navigate>가 발동해버리므로 테스트에서도 동일한
// 가드를 재현한다.
function AuthGate({ children }) {
  const { loading } = useAuth();
  if (loading) return null;
  return children;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/audit-log']}>
      <AuthProvider>
        <AuthGate>
          <Routes>
            <Route path="/audit-log" element={<AuditLog />} />
            <Route path="/dashboard" element={<div>대시보드 화면</div>} />
          </Routes>
        </AuthGate>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('AuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the audit log table for an admin', async () => {
    seedAdmin();
    assetApi.getAuditLogs.mockResolvedValue({
      data: {
        data: {
          items: [
            { id: 1, createdAt: '2026-07-13T09:00:00', changedBy: 'admin', action: 'CREATE', assetCode: 'ASSET-001', changes: null },
          ],
          total: 1,
        },
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('ASSET-001')).toBeInTheDocument());
    // 필터 드롭다운에도 "등록" 옵션이 있으므로 배지 쪽만 지정해서 확인한다.
    expect(screen.getByText('ASSET-001').closest('tr')).toHaveTextContent('등록');
  });

  it('searches audit logs by asset name (not asset code)', async () => {
    const user = userEvent.setup();
    seedAdmin();
    assetApi.getAuditLogs.mockResolvedValue({
      data: {
        data: {
          items: [
            { id: 1, createdAt: '2026-07-13T09:00:00', changedBy: 'admin', action: 'CREATE', assetCode: 'ASSET-001', assetName: '검색용 테스트 노트북', changes: null },
          ],
          total: 1,
        },
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('ASSET-001')).toBeInTheDocument());
    expect(screen.getByText('검색용 테스트 노트북')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('자산명 검색...'), '테스트 노트북');

    await waitFor(() => expect(assetApi.getAuditLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: '테스트 노트북' })
    ));
  });

  it('shows an empty state when there are no log entries', async () => {
    seedAdmin();
    assetApi.getAuditLogs.mockResolvedValue({ data: { data: { items: [], total: 0 } } });
    renderPage();
    await waitFor(() => expect(screen.getByText('기록이 없습니다.')).toBeInTheDocument());
  });

  it('redirects a non-admin user away from the page instead of showing the logs', async () => {
    // 이 화면은 useAuth()의 user가 아직 로딩 중일 때(null) 잘못 리다이렉트하지 않고,
    // 로딩이 끝나 role이 확정된 뒤에만 리다이렉트해야 한다.
    seedUser();
    assetApi.getAuditLogs.mockResolvedValue({ data: { data: { items: [], total: 0 } } });
    renderPage();
    await waitFor(() => expect(screen.getByText('대시보드 화면')).toBeInTheDocument());
    expect(screen.queryByText('활동 감사 로그')).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AssetDetail from './AssetDetail';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { assetApi, aiApi } from '../services/api';

vi.mock('../services/api', () => ({
  assetApi: {
    getById: vi.fn(),
    getMaintenanceHistory: vi.fn(),
    getHistory: vi.fn(),
    updateMaintenanceRecord: vi.fn(),
    deleteMaintenanceRecord: vi.fn(),
  },
  aiApi: {
    getProcurementSpec: vi.fn(),
    diagnoseFailure: vi.fn(),
    getWorkOrder: vi.fn(),
  },
}));

const SAMPLE_ASSET = {
  id: 1,
  assetName: '노트북 Dell Latitude 5520',
  assetCode: 'ASSET-001',
  category: 'IT 장비',
  location: '본관 5층',
  responsiblePerson: '김철수',
  purchaseDate: '2020-01-01',
  purchasePrice: 1200000,
  usefulLife: 5,
  status: 'ACTIVE',
  description: '',
};

const SAMPLE_RECORD = {
  id: 10,
  maintenanceDate: '2024-05-01',
  maintenanceType: 'REPAIR',
  cost: 30000,
  description: '하드디스크 교체',
  technician: '김기술',
  failureType: 'HDD 오류',
};

function seedAdmin() {
  localStorage.setItem('auth_user', JSON.stringify({ token: 't', username: 'admin', role: 'ADMIN' }));
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assets/1']}>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <Routes>
              <Route path="/assets/:id" element={<AssetDetail />} />
            </Routes>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('AssetDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    seedAdmin();
    assetApi.getById.mockResolvedValue({ data: { data: SAMPLE_ASSET } });
    assetApi.getMaintenanceHistory.mockResolvedValue({ data: { data: { items: [SAMPLE_RECORD] } } });
    assetApi.getHistory.mockResolvedValue({ data: { data: { items: [] } } });
  });

  it('renders asset details and maintenance history after loading', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: '노트북 Dell Latitude 5520' })).toBeInTheDocument());
    expect(screen.getByText('하드디스크 교체')).toBeInTheDocument();
  });

  it('opens the maintenance record edit modal pre-filled and closes it without crashing', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('하드디스크 교체')).toBeInTheDocument());

    await user.click(screen.getByTitle('수정'));
    expect(screen.getByRole('heading', { name: '유지보수 기록 수정' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('30000')).toBeInTheDocument();

    await user.click(screen.getByText('취소'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: '유지보수 기록 수정' })).not.toBeInTheDocument());
  });

  it('asks for confirmation before deleting a maintenance record', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('하드디스크 교체')).toBeInTheDocument());

    await user.click(screen.getByTitle('삭제'));
    expect(screen.getByText('이 유지보수 기록을 삭제하시겠습니까?')).toBeInTheDocument();

    await user.click(screen.getByText('취소'));
    expect(assetApi.deleteMaintenanceRecord).not.toHaveBeenCalled();
  });

  it('loads and displays the AI work order modal, then closes it', async () => {
    const user = userEvent.setup();
    aiApi.getWorkOrder.mockResolvedValue({
      data: {
        id: 1,
        title: '[작업 지시서] 하드디스크 교체',
        steps: ['전원을 끈다', '디스크를 교체한다'],
        requiredTools: ['드라이버'],
        safetyPrecautions: ['정전기 방지'],
        estimatedTime: '30분',
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('하드디스크 교체')).toBeInTheDocument());

    await user.click(screen.getByText('AI 작업 지시서'));
    await waitFor(() => expect(screen.getByText('[작업 지시서] 하드디스크 교체')).toBeInTheDocument());

    await user.click(screen.getByText('닫기'));
    await waitFor(() => expect(screen.queryByText('[작업 지시서] 하드디스크 교체')).not.toBeInTheDocument());
  });
});

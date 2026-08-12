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
    downloadProcurementSpecPdf: vi.fn(),
    diagnoseFailure: vi.fn(),
    getWorkOrder: vi.fn(),
  },
}));

const SAMPLE_ASSET = {
  id: 1,
  assetName: '노트북 Dell Latitude 5520',
  assetCode: 1,
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

// 유지보수 이력은 상단 버튼을 눌러야 모달로 뜨므로, 목록 내용을 확인하기 전에
// 항상 "유지보수 이력" 버튼을 먼저 클릭해 모달을 열어야 한다.
async function openMaintenanceHistory(user) {
  await user.click(screen.getByText('유지보수 이력'));
}

describe('AssetDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    seedAdmin();
    assetApi.getById.mockResolvedValue({ data: { data: SAMPLE_ASSET } });
    assetApi.getMaintenanceHistory.mockResolvedValue({
      data: { data: { items: [SAMPLE_RECORD], total: 1, totalCost: 30000 } },
    });
    assetApi.getHistory.mockResolvedValue({ data: { data: { items: [] } } });
  });

  it('renders asset details and maintenance history after loading', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: '노트북 Dell Latitude 5520' })).toBeInTheDocument());
    await openMaintenanceHistory(user);
    expect(screen.getByText('하드디스크 교체')).toBeInTheDocument();
  });

  it('shows the server-aggregated total count/cost, not just the loaded page length', async () => {
    // 한 자산의 유지보수 기록이 한 페이지(최대 200건)를 넘을 수 있으므로, 요약 숫자는
    // 로드된 items 배열이 아니라 서버가 집계해 내려주는 total/totalCost를 써야 한다.
    assetApi.getMaintenanceHistory.mockResolvedValue({
      data: { data: { items: [SAMPLE_RECORD], total: 250, totalCost: 12345000 } },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('250건')).toBeInTheDocument());
    expect(screen.getByText('12,345,000원')).toBeInTheDocument();
  });

  it('opens the maintenance record edit modal pre-filled and closes it without crashing', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: '노트북 Dell Latitude 5520' })).toBeInTheDocument());
    await openMaintenanceHistory(user);
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
    await waitFor(() => expect(screen.getByRole('heading', { name: '노트북 Dell Latitude 5520' })).toBeInTheDocument());
    await openMaintenanceHistory(user);
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
    await waitFor(() => expect(screen.getByRole('heading', { name: '노트북 Dell Latitude 5520' })).toBeInTheDocument());
    await openMaintenanceHistory(user);
    await waitFor(() => expect(screen.getByText('하드디스크 교체')).toBeInTheDocument());

    await user.click(screen.getByText('AI 작업 지시서'));
    await waitFor(() => expect(screen.getByText('[작업 지시서] 하드디스크 교체')).toBeInTheDocument());

    // 유지보수 이력 모달이 열려 있는 상태에서 그 위에 작업 지시서 모달이 겹쳐 뜨므로
    // "닫기" 버튼이 두 개 존재한다 — 나중에 열린(뒤쪽) 작업 지시서 모달의 버튼을 누른다.
    const closeButtons = screen.getAllByText('닫기');
    await user.click(closeButtons[closeButtons.length - 1]);
    await waitFor(() => expect(screen.queryByText('[작업 지시서] 하드디스크 교체')).not.toBeInTheDocument());
  });

  it('generates the procurement spec and downloads it as a real PDF, not window.print()', async () => {
    const user = userEvent.setup();
    aiApi.getProcurementSpec.mockResolvedValue({
      data: { title: '노트북 교체 규격서', specifications: '스펙 내용', rfp: 'RFP 내용', budgetEstimate: 1200000, rationale: '근거' },
    });
    aiApi.downloadProcurementSpecPdf.mockResolvedValue({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) });
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: '노트북 Dell Latitude 5520' })).toBeInTheDocument());

    await user.click(screen.getByText('AI 조달 규격서/RFP 생성'));
    await waitFor(() => expect(screen.getByText('노트북 교체 규격서')).toBeInTheDocument());

    await user.click(screen.getByText('규격서/RFP PDF 다운로드'));
    // PDF는 서버가 생성해 캐시해둔 규격서로 만들어지므로(B6) 화면의 spec을 body로
    // 보내지 않는다 - assetId만 넘기는지 확인한다.
    await waitFor(() => expect(aiApi.downloadProcurementSpecPdf).toHaveBeenCalledWith(SAMPLE_ASSET.id));

    // 헤더/푸터에 동일한 기능의 "닫기" 버튼이 두 개 있으므로 첫 번째만 사용한다.
    await user.click(screen.getAllByText('닫기')[0]);
    await waitFor(() => expect(screen.queryByText('노트북 교체 규격서')).not.toBeInTheDocument());
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Recommendations from './Recommendations';
import { ToastProvider } from '../context/ToastContext';
import { AuthProvider } from '../context/AuthContext';
import { aiApi, assetApi } from '../services/api';

vi.mock('../services/api', () => ({
  aiApi: {
    getReplacementRecommendation: vi.fn(),
    getProcurementSpec: vi.fn(),
    downloadProcurementSpecPdf: vi.fn(),
  },
  assetApi: {
    getCategoryImportance: vi.fn(),
    updateCategoryImportance: vi.fn(),
  },
}));

function seedAdmin() {
  localStorage.setItem('auth_user', JSON.stringify({ token: 't', username: 'admin', role: 'ADMIN' }));
}

const RECOMMENDATION = {
  assetId: 1,
  assetName: '데스크톱 Lenovo ThinkCentre',
  assetCode: 'ASSET-003',
  score: 111.2,
  purchasePrice: 800000,
  totalRepairCost: 345000,
  usedYears: 8,
  usefulLife: 5,
  maintenanceCount: 5,
  reason: '내용연수를 초과해 사용 중입니다.',
};

function renderPage() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <Recommendations />
      </AuthProvider>
    </ToastProvider>
  );
}

describe('Recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders a recommendation card after loading', async () => {
    aiApi.getReplacementRecommendation.mockResolvedValue({ data: { data: { recommendations: [RECOMMENDATION] } } });
    renderPage();
    await waitFor(() => expect(screen.getByText('데스크톱 Lenovo ThinkCentre')).toBeInTheDocument());
    expect(screen.getByText('111.2점')).toBeInTheDocument();
    // reasonUpdatedAt이 없는(규칙 기반 문구) 경우엔 작성일을 표시하지 않는다.
    expect(screen.queryByText(/작성\)/)).not.toBeInTheDocument();
  });

  it('shows when the AI reason was written, and hides the date when it has none', async () => {
    aiApi.getReplacementRecommendation.mockResolvedValue({
      data: { data: { recommendations: [{ ...RECOMMENDATION, reasonUpdatedAt: '2024-06-01T09:00:00' }] } },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('내용연수를 초과해 사용 중입니다.')).toBeInTheDocument());
    expect(screen.getByText(/작성\)/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no recommendations', async () => {
    aiApi.getReplacementRecommendation.mockResolvedValue({ data: { data: { recommendations: [] } } });
    renderPage();
    await waitFor(() => expect(screen.getByText('교체 권장 자산이 없습니다.')).toBeInTheDocument());
  });

  it('opens the procurement spec modal and closes it without crashing', async () => {
    const user = userEvent.setup();
    aiApi.getReplacementRecommendation.mockResolvedValue({ data: { data: { recommendations: [RECOMMENDATION] } } });
    aiApi.getProcurementSpec.mockResolvedValue({
      data: { title: 'NAS 스토리지 규격서', specifications: '스펙 내용', rfp: 'RFP 내용', budgetEstimate: 5000000, rationale: '근거' },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('데스크톱 Lenovo ThinkCentre')).toBeInTheDocument());

    await user.click(screen.getByText('AI 조달 규격서/RFP 생성'));
    await waitFor(() => expect(screen.getByText('NAS 스토리지 규격서')).toBeInTheDocument());

    // 헤더/푸터에 동일한 기능의 "닫기" 버튼이 두 개 있으므로 첫 번째만 사용한다.
    await user.click(screen.getAllByText('닫기')[0]);
    await waitFor(() => expect(screen.queryByText('NAS 스토리지 규격서')).not.toBeInTheDocument());
  });

  it('downloads the procurement spec as a real PDF file via reportlab backend', async () => {
    const user = userEvent.setup();
    aiApi.getReplacementRecommendation.mockResolvedValue({ data: { data: { recommendations: [RECOMMENDATION] } } });
    aiApi.getProcurementSpec.mockResolvedValue({
      data: { title: 'NAS 스토리지 규격서', specifications: '스펙 내용', rfp: 'RFP 내용', budgetEstimate: 5000000, rationale: '근거' },
    });
    aiApi.downloadProcurementSpecPdf.mockResolvedValue({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) });
    renderPage();
    await waitFor(() => expect(screen.getByText('데스크톱 Lenovo ThinkCentre')).toBeInTheDocument());

    await user.click(screen.getByText('AI 조달 규격서/RFP 생성'));
    await waitFor(() => expect(screen.getByText('NAS 스토리지 규격서')).toBeInTheDocument());

    await user.click(screen.getByText('규격서/RFP PDF 다운로드'));
    await waitFor(() => expect(aiApi.downloadProcurementSpecPdf).toHaveBeenCalledWith(
      RECOMMENDATION.assetId,
      expect.objectContaining({ title: 'NAS 스토리지 규격서' })
    ));
  });

  it('re-queries with a budget filter when Enter is pressed in the budget field', async () => {
    const user = userEvent.setup();
    aiApi.getReplacementRecommendation.mockResolvedValue({ data: { data: { recommendations: [] } } });
    renderPage();
    await waitFor(() => expect(aiApi.getReplacementRecommendation).toHaveBeenCalledTimes(1));

    await user.type(screen.getByPlaceholderText('입력 후 Enter'), '1000000{Enter}');

    await waitFor(() => expect(aiApi.getReplacementRecommendation).toHaveBeenCalledWith(1000000));
  });

  it('shows the category importance breakdown on a recommendation card', async () => {
    aiApi.getReplacementRecommendation.mockResolvedValue({
      data: { data: { recommendations: [{ ...RECOMMENDATION, categoryImportance: 90 }] } },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('데스크톱 Lenovo ThinkCentre')).toBeInTheDocument());
    expect(screen.getByText('90/100')).toBeInTheDocument();
  });

  it('hides the category importance management button for non-admin users', async () => {
    aiApi.getReplacementRecommendation.mockResolvedValue({ data: { data: { recommendations: [] } } });
    renderPage();
    await waitFor(() => expect(screen.getByText('교체 권장 자산이 없습니다.')).toBeInTheDocument());
    expect(screen.queryByText('카테고리 중요도 관리')).not.toBeInTheDocument();
  });

  it('lets an admin open the category importance panel and override a score', async () => {
    const user = userEvent.setup();
    seedAdmin();
    aiApi.getReplacementRecommendation.mockResolvedValue({ data: { data: { recommendations: [] } } });
    assetApi.getCategoryImportance.mockResolvedValue({
      data: { data: [{ category: 'NAS', score: 50, reason: 'AI 미설정으로 기본값 적용', source: 'DEFAULT' }] },
    });
    assetApi.updateCategoryImportance.mockResolvedValue({
      data: { data: { category: 'NAS', score: 95, reason: '관리자가 직접 설정', source: 'MANUAL' } },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('교체 권장 자산이 없습니다.')).toBeInTheDocument());

    await user.click(screen.getByText('카테고리 중요도 관리'));
    await waitFor(() => expect(screen.getByText('NAS')).toBeInTheDocument());

    const scoreInput = screen.getByDisplayValue('50');
    await user.clear(scoreInput);
    await user.type(scoreInput, '95');
    await user.click(screen.getByText('저장'));

    await waitFor(() => expect(assetApi.updateCategoryImportance).toHaveBeenCalledWith('NAS', 95));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Reports from './Reports';
import { ToastProvider } from '../context/ToastContext';
import { reportApi } from '../services/api';

vi.mock('../services/api', () => ({
  reportApi: {
    getMonthly: vi.fn(),
    getNarrative: vi.fn(),
    downloadPdf: vi.fn(),
  },
}));

const REPORT_DATA = {
  totalAssets: 25,
  byStatus: { ACTIVE: 20, REPLACEMENT_NEEDED: 3 },
  totalMaintenanceCost: 7332000,
  repeatedFailureCount: 7,
  executiveSummary: null,
  keyIssues: null,
  recommendations: null,
};

function renderPage() {
  return render(
    <ToastProvider>
      <Reports />
    </ToastProvider>
  );
}

describe('Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportApi.getMonthly.mockResolvedValue({ data: { data: REPORT_DATA } });
  });

  it('renders the report preview numbers after loading', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('25 개')).toBeInTheDocument());
    expect(screen.getByText('20 개')).toBeInTheDocument();
    expect(screen.getByText('7 개')).toBeInTheDocument();
  });

  it('does not show the AI narrative section until requested', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('AI 요약 보기')).toBeInTheDocument());
    expect(screen.queryByText('AI 요약')).not.toBeInTheDocument();
  });

  it('loads and displays the AI narrative when the button is clicked, without re-fetching the whole report', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('AI 요약 보기')).toBeInTheDocument());

    reportApi.getNarrative.mockResolvedValue({
      data: {
        data: {
          executiveSummary: '총 25개 자산을 관리 중입니다.',
          keyIssues: ['반복 고장 자산이 있습니다.'],
          recommendations: ['정기 점검을 강화하세요.'],
        },
      },
    });
    await user.click(screen.getByText('AI 요약 보기'));

    await waitFor(() => expect(screen.getByText('총 25개 자산을 관리 중입니다.')).toBeInTheDocument());
    expect(screen.getByText('반복 고장 자산이 있습니다.')).toBeInTheDocument();
    // AI 요약은 이미 화면에 있는 통계를 그대로 넘겨 서술만 받아오고, 통계 자체를
    // 다시 조회(getMonthly)하지는 않아야 한다.
    expect(reportApi.getMonthly).toHaveBeenCalledTimes(1);
    expect(reportApi.getNarrative).toHaveBeenCalledWith(expect.objectContaining({ totalAssets: 25 }));
  });

  it('triggers a PDF download when the download button is clicked', async () => {
    const user = userEvent.setup();
    reportApi.downloadPdf.mockResolvedValue({ data: new Blob(['%PDF'], { type: 'application/pdf' }) });
    renderPage();
    await waitFor(() => expect(screen.getByText('AI 요약 보기')).toBeInTheDocument());

    await user.click(screen.getByText('PDF 다운로드'));

    await waitFor(() => expect(reportApi.downloadPdf).toHaveBeenCalledTimes(1));
  });
});

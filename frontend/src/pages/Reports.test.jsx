import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Reports from './Reports';
import { ToastProvider } from '../context/ToastContext';
import { reportApi } from '../services/api';

const CURRENT_MONTH = new Date().getMonth() + 1;

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

  it('disables the year/month selects while an AI summary request is in flight', async () => {
    // handleLoadAiSummary는 응답이 오면 "현재" report 상태에 병합한다(setReport(prev => ...)).
    // 요청이 떠 있는 동안 연/월을 바꿀 수 있으면, 늦게 도착한 예전 기간의 AI 요약이 새
    // 기간의 통계 위에 잘못 덮어써진다(실제로 유지보수 분석 페이지에서 발생했던 것과
    // 같은 종류의 레이스). AI 호출은 토큰 비용이 드니 응답을 버리는 대신 애초에
    // 연/월을 못 바꾸게 막아야 한다.
    const user = userEvent.setup();
    let resolveAiCall;
    const aiCallPromise = new Promise((resolve) => {
      resolveAiCall = resolve;
    });
    reportApi.getNarrative.mockReturnValue(aiCallPromise);

    renderPage();
    await waitFor(() => expect(screen.getByText('AI 요약 보기')).toBeInTheDocument());

    await user.click(screen.getByText('AI 요약 보기'));
    expect(screen.getByText('생성 중...')).toBeInTheDocument();

    expect(screen.getByLabelText('보고 대상')).toBeDisabled();
    expect(document.getElementById('report-month')).toBeDisabled();
    expect(screen.getByText('새로고침')).toBeDisabled();

    resolveAiCall({
      data: { data: { executiveSummary: '요약입니다.', keyIssues: ['문제1'], recommendations: ['권장1'] } },
    });

    await waitFor(() => expect(screen.getByText('요약입니다.')).toBeInTheDocument());
    expect(screen.getByLabelText('보고 대상')).not.toBeDisabled();
  });

  it('triggers a PDF download when the download button is clicked', async () => {
    const user = userEvent.setup();
    reportApi.downloadPdf.mockResolvedValue({ data: new Blob(['%PDF'], { type: 'application/pdf' }) });
    renderPage();
    await waitFor(() => expect(screen.getByText('AI 요약 보기')).toBeInTheDocument());

    await user.click(screen.getByText('PDF 다운로드'));

    await waitFor(() => expect(reportApi.downloadPdf).toHaveBeenCalledTimes(1));
  });

  it('PDF 생성 중에는 보고 대상 select 가 잠기고 안내 문구를 보여준다', async () => {
    const user = userEvent.setup();
    let resolveDownload;
    reportApi.downloadPdf.mockReturnValue(
      new Promise((resolve) => { resolveDownload = resolve; })
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('AI 요약 보기')).toBeInTheDocument());

    await user.click(screen.getByText('PDF 다운로드'));

    expect(screen.getByLabelText('보고 대상')).toBeDisabled();
    expect(document.getElementById('report-month')).toBeDisabled();
    expect(screen.getByText('새로고침')).toBeDisabled();
    expect(
      screen.getByTitle(`${CURRENT_MONTH}월 PDF 를 다운중입니다 !`)
    ).toBeInTheDocument();

    resolveDownload({ data: new Blob(['%PDF'], { type: 'application/pdf' }) });
    await waitFor(() =>
      expect(screen.getByLabelText('보고 대상')).not.toBeDisabled()
    );
  });
});

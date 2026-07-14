import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { aiApi } from '../services/api';

vi.mock('../services/api', () => ({
  aiApi: { getDashboardData: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

const BASE_DATA = {
  currentMonthMaintenanceCost: 500000,
  newFailureCount: 1,
  operationRate: 80,
  budgetConsumptionRate: 45,
  hasBudgetData: true,
  totalAssets: 25,
  activeAssets: 20,
  replacementNeededAssets: 3,
  isSimulated: false,
};

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the stat cards after loading', async () => {
    aiApi.getDashboardData.mockResolvedValue({ data: { data: BASE_DATA } });
    renderPage();

    await waitFor(() => expect(screen.getByText('500,000원')).toBeInTheDocument());
    expect(screen.getByText('45.0%')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('shows an error state with a retry button when the API call fails', async () => {
    aiApi.getDashboardData.mockRejectedValue(new Error('network error'));
    renderPage();

    await waitFor(() => expect(screen.getByText('대시보드 데이터를 불러오지 못했습니다.')).toBeInTheDocument());
    expect(screen.getByText('다시 시도')).toBeInTheDocument();
  });

  it('caps an extreme budget consumption rate instead of showing a raw absurd number', async () => {
    // 배정 예산이 1원처럼 극단적으로 작을 때 소진율이 50000000%까지 치솟았던 실제 사례.
    aiApi.getDashboardData.mockResolvedValue({
      data: { data: { ...BASE_DATA, budgetConsumptionRate: 50000000 } },
    });
    renderPage();

    await waitFor(() => expect(screen.getAllByText('999%+').length).toBeGreaterThan(0));
    expect(screen.queryByText(/50000000/)).not.toBeInTheDocument();
  });

  it('shows the budget warning banner only when consumption is at or above 90%', async () => {
    aiApi.getDashboardData.mockResolvedValue({
      data: { data: { ...BASE_DATA, budgetConsumptionRate: 95 } },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/예산 경고/)).toBeInTheDocument());
  });

  it('retries loading when the retry button is clicked', async () => {
    const user = userEvent.setup();
    aiApi.getDashboardData.mockRejectedValueOnce(new Error('network error'));
    aiApi.getDashboardData.mockResolvedValueOnce({ data: { data: BASE_DATA } });
    renderPage();

    await waitFor(() => expect(screen.getByText('다시 시도')).toBeInTheDocument());
    await user.click(screen.getByText('다시 시도'));

    await waitFor(() => expect(screen.getByText('500,000원')).toBeInTheDocument());
    expect(aiApi.getDashboardData).toHaveBeenCalledTimes(2);
  });
});

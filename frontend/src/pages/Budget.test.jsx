import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Budget from './Budget';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { budgetApi, aiApi } from '../services/api';

vi.mock('../services/api', () => ({
  budgetApi: { getAll: vi.fn(), set: vi.fn(), delete: vi.fn() },
  aiApi: { getMaintenanceAnalysis: vi.fn(), getBudgetForecast: vi.fn(), simulateBudget: vi.fn() },
}));

const CURRENT_YEAR = new Date().getFullYear();

function seedAdmin() {
  localStorage.setItem('auth_user', JSON.stringify({ token: 't', username: 'admin', role: 'ADMIN' }));
}

function seedUser() {
  localStorage.setItem('auth_user', JSON.stringify({ token: 't', username: 'user', role: 'USER' }));
}

function renderPage() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <Budget />
      </AuthProvider>
    </ToastProvider>
  );
}

describe('Budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    budgetApi.getAll.mockResolvedValue({
      data: { data: [{ id: 1, year: CURRENT_YEAR, month: 7, allocatedAmount: 500000 }] },
    });
    // 배정 예산과 실제 사용액을 일부러 다른 값으로 둬서 텍스트 조회가 모호해지지 않게 한다.
    aiApi.getMaintenanceAnalysis.mockResolvedValue({
      data: { data: { costTrend: { monthlyCosts: { [`${CURRENT_YEAR}-07`]: 250000 } } } },
    });
  });

  it('renders the twelve-month budget table with the allocated amount and consumption rate', async () => {
    seedAdmin();
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('500000')).toBeInTheDocument());
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });

  it('caps an extreme consumption rate instead of showing a raw absurd percentage', async () => {
    seedAdmin();
    budgetApi.getAll.mockResolvedValue({
      data: { data: [{ id: 1, year: CURRENT_YEAR, month: 7, allocatedAmount: 1 }] },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('999%+')).toBeInTheDocument());
  });

  it('hides the input fields and save buttons for a non-admin user', async () => {
    seedUser();
    renderPage();
    await waitFor(() => expect(screen.getByText('500,000원')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /저장/ })).not.toBeInTheDocument();
  });

  it('shows a validation toast instead of saving when the amount field is empty', async () => {
    const user = userEvent.setup();
    seedAdmin();
    budgetApi.getAll.mockResolvedValue({ data: { data: [] } });
    renderPage();
    await waitFor(() => expect(screen.getAllByPlaceholderText('미설정').length).toBeGreaterThan(0));

    // "전체 저장" 버튼도 정규식 /저장/에 걸리므로, 개별 행의 "저장" 버튼만 정확히 골라낸다.
    const saveButtons = screen.getAllByRole('button', { name: '저장' });
    await user.click(saveButtons[0]);

    await waitFor(() => expect(screen.getByText('올바른 금액을 입력하세요.')).toBeInTheDocument());
    expect(budgetApi.set).not.toHaveBeenCalled();
  });

  it('runs the AI forecast and lets the admin apply it to the input fields', async () => {
    const user = userEvent.setup();
    seedAdmin();
    aiApi.getBudgetForecast.mockResolvedValue({
      data: {
        rationale: '과거 추세 분석 결과입니다.',
        monthlyForecast: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: 100000 * (i + 1), reason: '사유' })),
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('차년도 예산 예측 실행')).toBeInTheDocument());

    await user.click(screen.getByText('차년도 예산 예측 실행'));
    await waitFor(() => expect(screen.getByText('과거 추세 분석 결과입니다.')).toBeInTheDocument());

    await user.click(screen.getByText('위 예측값을 입력창에 일괄 대입하기'));
    await waitFor(() =>
      expect(screen.getByText('AI 예측 예산 금액이 입력창에 일괄 대입되었습니다. 저장하려면 상단의 "전체 저장" 버튼을 눌러주세요.')).toBeInTheDocument()
    );
  });
});

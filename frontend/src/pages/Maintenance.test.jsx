import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Maintenance from './Maintenance';
import { SettingsProvider } from '../context/SettingsContext';
import { aiApi, assetApi } from '../services/api';

vi.mock('../services/api', () => ({
  aiApi: {
    getMaintenanceAnalysis: vi.fn(),
    getAssetsByFailureType: vi.fn(),
  },
  assetApi: {
    getById: vi.fn(),
    getMaintenanceHistory: vi.fn(),
  },
}));

const ANALYSIS = {
  statistics: { totalRecords: 10, totalCost: 500000, averageCost: 50000, currentMonthCount: 2 },
  failurePatterns: { 'HDD 오류': 3, 전원고장: 2 },
  costTrend: { monthlyCosts: { '2024-01': 100000, '2024-02': 200000 } },
};

function renderPage() {
  return render(
    <SettingsProvider>
      <MemoryRouter>
        <Maintenance />
      </MemoryRouter>
    </SettingsProvider>
  );
}

describe('Maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiApi.getMaintenanceAnalysis.mockResolvedValue({ data: { data: ANALYSIS } });
  });

  it('renders the statistics cards and failure type table after loading', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('AI 유지보수 분석')).toBeInTheDocument());
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('HDD 오류')).toBeInTheDocument();
  });

  it('opens the failure-type asset list modal when a row is clicked, and closes it without crashing', async () => {
    const user = userEvent.setup();
    aiApi.getAssetsByFailureType.mockResolvedValue({
      data: {
        data: [
          { id: 1, assetName: '노트북 Dell Latitude 5520', assetCode: 'ASSET-001', category: 'IT 장비', status: 'ACTIVE', occurrenceCount: 3 },
        ],
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('HDD 오류')).toBeInTheDocument());

    await user.click(screen.getByText('HDD 오류'));

    await waitFor(() => expect(screen.getByText("'HDD 오류' 발생 자산")).toBeInTheDocument());
    expect(screen.getByText('노트북 Dell Latitude 5520')).toBeInTheDocument();

    await user.click(screen.getByText('닫기'));
    await waitFor(() => expect(screen.queryByText("'HDD 오류' 발생 자산")).not.toBeInTheDocument());
  });

  it('drills into an individual asset from the failure list and can navigate back without crashing', async () => {
    // 이 화면은 viewingAsset이 null일 때 대비 ternary로 이미 가드되어 있지만,
    // 실제로 자산을 클릭해서 상세로 들어갔다가 뒤로 가는 흐름까지 회귀 검증한다.
    const user = userEvent.setup();
    aiApi.getAssetsByFailureType.mockResolvedValue({
      data: {
        data: [
          { id: 1, assetName: '노트북 Dell Latitude 5520', assetCode: 'ASSET-001', category: 'IT 장비', status: 'ACTIVE', occurrenceCount: 3 },
        ],
      },
    });
    assetApi.getById.mockResolvedValue({
      data: { data: { id: 1, assetName: '노트북 Dell Latitude 5520', assetCode: 'ASSET-001', category: 'IT 장비', location: '본관', responsiblePerson: '김철수', purchaseDate: '2020-01-01', purchasePrice: 1200000, status: 'ACTIVE' } },
    });
    assetApi.getMaintenanceHistory.mockResolvedValue({ data: { data: { items: [] } } });

    renderPage();
    await waitFor(() => expect(screen.getByText('HDD 오류')).toBeInTheDocument());
    await user.click(screen.getByText('HDD 오류'));
    await waitFor(() => screen.getByText('노트북 Dell Latitude 5520', { selector: 'td' }));

    await user.click(screen.getByText('노트북 Dell Latitude 5520', { selector: 'td' }));
    await waitFor(() => expect(screen.getByText('유지보수 이력이 없습니다.')).toBeInTheDocument());

    await user.click(screen.getByText('목록으로'));
    await waitFor(() => expect(screen.getByText("'HDD 오류' 발생 자산")).toBeInTheDocument());
  });

  it('shows the AI analysis text after clicking the analyze button', async () => {
    const user = userEvent.setup();
    aiApi.getMaintenanceAnalysis.mockImplementation((params = {}) => {
      if (params.includeAi) {
        return Promise.resolve({ data: { data: { aiAnalysis: '반복 고장 자산이 발견되었습니다.' } } });
      }
      return Promise.resolve({ data: { data: ANALYSIS } });
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('AI 유지보수 분석')).toBeInTheDocument());

    await user.click(screen.getByText('AI 분석하기'));

    await waitFor(() => expect(screen.getByText('반복 고장 자산이 발견되었습니다.')).toBeInTheDocument());
  });

  it('disables the period controls while an AI analysis request is in flight', async () => {
    // AI 분석은 실제 토큰을 쓰는 호출이라, 응답이 오기 전에 기간을 바꿔서 그 결과를
    // 버리게 되면 이미 쓴 토큰이 낭비된다. 그러니 애초에 기간을 못 바꾸게 막아서
    // "선택한 기간과 다른 AI 분석 결과가 나오는" 레이스 자체가 발생하지 않게 한다.
    const user = userEvent.setup();
    let resolveAiCall;
    const aiCallPromise = new Promise((resolve) => {
      resolveAiCall = resolve;
    });

    aiApi.getMaintenanceAnalysis.mockImplementation((params = {}) => {
      if (params.includeAi) return aiCallPromise;
      return Promise.resolve({ data: { data: ANALYSIS } });
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('AI 유지보수 분석')).toBeInTheDocument());

    await user.click(screen.getByText('AI 분석하기'));
    expect(screen.getByText('분석 중...')).toBeInTheDocument();

    const [startYearSelect, startMonthSelect, endYearSelect, endMonthSelect] = screen.getAllByRole('combobox');
    expect(startYearSelect).toBeDisabled();
    expect(startMonthSelect).toBeDisabled();
    expect(endYearSelect).toBeDisabled();
    expect(endMonthSelect).toBeDisabled();

    resolveAiCall({ data: { data: { aiAnalysis: '분석 결과입니다.' } } });

    await waitFor(() => expect(screen.getByText('분석 결과입니다.')).toBeInTheDocument());
    expect(screen.getAllByRole('combobox')[0]).not.toBeDisabled();
  });

  it('shows a validation message when the end month is before the start month', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('AI 유지보수 분석')).toBeInTheDocument());

    // 셀렉트 참조를 한 번만 캡처해서 재사용하면 중간 리렌더링 사이에 DOM 노드가
    // 교체되어 이후 선택이 이미 떨어져나간 노드에 적용될 수 있으므로 매번 새로 조회한다.
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], '2025');
    await userEvent.selectOptions(screen.getAllByRole('combobox')[1], '6');
    await userEvent.selectOptions(screen.getAllByRole('combobox')[2], '2024');
    await userEvent.selectOptions(screen.getAllByRole('combobox')[3], '1');

    expect(screen.getAllByText('종료월이 시작월보다 빠릅니다. 범위를 다시 선택해주세요.').length).toBeGreaterThan(0);
  });
});

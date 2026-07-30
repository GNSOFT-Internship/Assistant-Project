import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AiAssistant from './AiAssistant';
import { ToastProvider } from '../context/ToastContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { aiApi, assetApi, chatApi } from '../services/api';

vi.mock('../services/api', () => ({
  aiApi: { askQuestion: vi.fn() },
  assetApi: { getById: vi.fn(), getMaintenanceHistory: vi.fn() },
  chatApi: { getHistory: vi.fn(), clearHistory: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AiAssistant />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('AiAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatApi.getHistory.mockResolvedValue({ data: { data: [] } });
    // jsdom은 실제 레이아웃을 계산하지 않아 scrollHeight/clientHeight가 항상 0이라, 스크롤 위치를
    // 검증하려면 메시지 개수에 비례해 늘어나는 가짜 scrollHeight를 흉내내야 한다.
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() { return this.children.length * 100; },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() { return 400; },
    });
  });

  it('scrolls to the most recent message after loading chat history on mount', async () => {
    // 회귀 테스트: 새 탭/새로고침 직후 대화 기록을 불러오면 스크롤이 기본값(맨 위)에
    // 있는 상태라, "이미 하단 근처일 때만 내린다"는 조건만으로는 절대 만족되지 않아
    // 맨 위에 그대로 머무르는 버그가 있었다.
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'USER' : 'AI',
      content: `메시지 ${i}`,
      assets: [],
    }));
    chatApi.getHistory.mockResolvedValue({ data: { data: history } });

    renderPage();
    await waitFor(() => expect(screen.getByText('메시지 9')).toBeInTheDocument());

    const container = document.querySelector('.overflow-y-auto');
    await waitFor(() => expect(container.scrollTop).toBe(container.scrollHeight));
    expect(container.scrollTop).toBeGreaterThan(0);
  });

  it('renders without crashing while no asset is being viewed', async () => {
    // 회귀 테스트: 이전에 viewingAsset이 null인 상태에서도
    // viewingAsset.assetName에 접근해 마운트 직후 크래시가 났던 버그.
    renderPage();
    await waitFor(() => expect(screen.getByText('질문을 입력하세요.')).toBeInTheDocument());
  });

  it('sends a question and renders the AI answer with a matching asset table', async () => {
    const user = userEvent.setup();
    aiApi.askQuestion.mockResolvedValue({
      data: {
        data: {
          answer: '3년 이상 사용한 노트북은 총 1건입니다.',
          hasFilter: true,
          assets: [
            { id: 1, assetName: '노트북 Dell Latitude 5520', assetCode: 'ASSET-001', category: 'IT 장비', status: 'ACTIVE' },
          ],
        },
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('질문을 입력하세요.')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('질문하거나 찾고 싶은 자산을 입력하세요...'), '3년 이상 사용한 노트북 보여줘');
    await user.click(screen.getByText('전송'));

    await waitFor(() => expect(screen.getByText('3년 이상 사용한 노트북은 총 1건입니다.')).toBeInTheDocument());
    expect(screen.getByText('노트북 Dell Latitude 5520')).toBeInTheDocument();
  });

  it('opens the asset detail modal on click and closes it without crashing', async () => {
    const user = userEvent.setup();
    aiApi.askQuestion.mockResolvedValue({
      data: {
        data: {
          answer: '검색 결과입니다.',
          hasFilter: true,
          assets: [
            { id: 1, assetName: '노트북 Dell Latitude 5520', assetCode: 'ASSET-001', category: 'IT 장비', status: 'ACTIVE' },
          ],
        },
      },
    });
    assetApi.getById.mockResolvedValue({
      data: {
        data: {
          id: 1,
          assetName: '노트북 Dell Latitude 5520',
          assetCode: 'ASSET-001',
          status: 'ACTIVE',
          category: 'IT 장비',
          purchasePrice: 1200000,
        },
      },
    });
    assetApi.getMaintenanceHistory.mockResolvedValue({ data: { data: { items: [] } } });

    renderPage();
    await waitFor(() => expect(screen.getByText('질문을 입력하세요.')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('질문하거나 찾고 싶은 자산을 입력하세요...'), '노트북');
    await user.click(screen.getByText('전송'));
    await waitFor(() => screen.getByText('노트북 Dell Latitude 5520', { selector: 'td' }));

    await user.click(screen.getByText('노트북 Dell Latitude 5520', { selector: 'td' }));

    // 모달 안에는 h2로, 표에는 td로 같은 자산명이 두 번 나타난다.
    await waitFor(() => expect(screen.getAllByText('노트북 Dell Latitude 5520').length).toBeGreaterThan(1));
    expect(screen.getByText('유지보수 이력이 없습니다.')).toBeInTheDocument();

    await user.click(screen.getByText('닫기'));
    await waitFor(() => expect(screen.queryByText('유지보수 이력이 없습니다.')).not.toBeInTheDocument());

    // 닫힌 뒤에도 페이지가 정상 상태를 유지하는지(재크래시 없음) 확인
    expect(screen.getByText('전송')).toBeInTheDocument();
  });

  it('shows a danger-styled confirmation before clearing all chat history', async () => {
    // 회귀 테스트: 대화 기록 전체 삭제는 자산/유지보수 기록 삭제와 마찬가지로
    // 되돌릴 수 없는 파괴적 동작이므로, 기본 파란 버튼이 아니라 danger 스타일의
    // 빨간 "삭제" 버튼으로 확인받아야 한다.
    const user = userEvent.setup();
    aiApi.askQuestion.mockResolvedValue({
      data: { data: { answer: '답변입니다.', hasFilter: false, assets: [] } },
    });
    chatApi.clearHistory.mockResolvedValue({ data: { success: true } });
    renderPage();
    await waitFor(() => expect(screen.getByText('질문을 입력하세요.')).toBeInTheDocument());

    // "대화 초기화" 버튼은 메시지가 하나라도 있어야 나타난다.
    await user.type(screen.getByPlaceholderText('질문하거나 찾고 싶은 자산을 입력하세요...'), '안녕');
    await user.click(screen.getByText('전송'));
    await waitFor(() => expect(screen.getByText('답변입니다.')).toBeInTheDocument());

    await user.click(screen.getByText('대화 초기화'));

    const confirmButton = await screen.findByRole('button', { name: '삭제' });
    expect(confirmButton).toHaveClass('btn-danger');

    await user.click(confirmButton);
    await waitFor(() => expect(chatApi.clearHistory).toHaveBeenCalledTimes(1));
  });
});

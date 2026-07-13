import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Assets from './Assets';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { assetApi } from '../services/api';

vi.mock('../services/api', () => ({
  assetApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    exportExcel: vi.fn(),
    importExcel: vi.fn(),
  },
}));

const SAMPLE_ASSET = {
  id: 1,
  assetName: '노트북 Dell Latitude 5520',
  assetCode: 'ASSET-001',
  category: 'IT 장비',
  location: '본관 5층',
  purchaseDate: '2020-01-01',
  purchasePrice: 1200000,
  status: 'ACTIVE',
};

function seedAdmin() {
  localStorage.setItem('auth_user', JSON.stringify({ token: 't', username: 'admin', role: 'ADMIN' }));
}

function seedUser() {
  localStorage.setItem('auth_user', JSON.stringify({ token: 't', username: 'user', role: 'USER' }));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <Assets />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('Assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    assetApi.getAll.mockResolvedValue({ data: { data: { items: [SAMPLE_ASSET], total: 1, page: 1, pageSize: 20 } } });
  });

  it('renders the asset list', async () => {
    seedAdmin();
    renderPage();
    await waitFor(() => expect(screen.getByText('노트북 Dell Latitude 5520')).toBeInTheDocument());
  });

  it('shows an empty state when there are no assets', async () => {
    seedAdmin();
    assetApi.getAll.mockResolvedValue({ data: { data: { items: [], total: 0, page: 1, pageSize: 20 } } });
    renderPage();
    await waitFor(() => expect(screen.getByText('일치하는 자산이 없습니다.')).toBeInTheDocument());
  });

  it('hides write actions for a non-admin user', async () => {
    seedUser();
    renderPage();
    await waitFor(() => expect(screen.getByText('노트북 Dell Latitude 5520')).toBeInTheDocument());
    expect(screen.queryByText('자산 등록')).not.toBeInTheDocument();
    expect(screen.queryByText('엑셀 일괄 등록')).not.toBeInTheDocument();
  });

  it('opens the create modal and closes it without crashing', async () => {
    const user = userEvent.setup();
    seedAdmin();
    renderPage();
    await waitFor(() => expect(screen.getByText('노트북 Dell Latitude 5520')).toBeInTheDocument());

    await user.click(screen.getByText('자산 등록'));
    expect(screen.getByRole('heading', { name: '자산 등록' })).toBeInTheDocument();

    await user.click(screen.getByText('취소'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: '자산 등록' })).not.toBeInTheDocument());
  });

  it('opens the edit modal pre-filled with the asset being edited', async () => {
    const user = userEvent.setup();
    seedAdmin();
    renderPage();
    await waitFor(() => expect(screen.getByText('노트북 Dell Latitude 5520')).toBeInTheDocument());

    const editButtons = document.querySelectorAll('tbody tr td:last-child button');
    // eye, edit, delete 순서 중 두 번째가 수정 버튼
    await user.click(editButtons[1]);

    expect(screen.getByRole('heading', { name: '자산 수정' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('노트북 Dell Latitude 5520')).toBeInTheDocument();
  });

  it('asks for confirmation before deleting and does not call the API when cancelled', async () => {
    const user = userEvent.setup();
    seedAdmin();
    renderPage();
    await waitFor(() => expect(screen.getByText('노트북 Dell Latitude 5520')).toBeInTheDocument());

    const deleteButtons = document.querySelectorAll('tbody tr td:last-child button');
    await user.click(deleteButtons[2]);

    expect(screen.getByText('정말 삭제하시겠습니까?')).toBeInTheDocument();
    await user.click(screen.getByText('취소'));

    expect(assetApi.delete).not.toHaveBeenCalled();
  });

  it('deletes the asset when the confirmation is accepted', async () => {
    const user = userEvent.setup();
    seedAdmin();
    assetApi.delete.mockResolvedValue({ data: { success: true } });
    renderPage();
    await waitFor(() => expect(screen.getByText('노트북 Dell Latitude 5520')).toBeInTheDocument());

    const deleteButtons = document.querySelectorAll('tbody tr td:last-child button');
    await user.click(deleteButtons[2]);
    await user.click(screen.getByText('삭제'));

    await waitFor(() => expect(assetApi.delete).toHaveBeenCalledWith(1));
  });
});

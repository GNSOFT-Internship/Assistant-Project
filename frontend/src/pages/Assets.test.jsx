import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Assets from './Assets';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { assetApi, fileApi } from '../services/api';

vi.mock('../services/api', () => ({
  assetApi: {
    getAll: vi.fn(),
    getCategories: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    exportExcel: vi.fn(),
    importExcel: vi.fn(),
  },
  fileApi: {
    getAll: vi.fn(),
    upload: vi.fn(),
    batchUpload: vi.fn(),
    process: vi.fn(),
    apply: vi.fn(),
    batchApply: vi.fn(),
    unapply: vi.fn(),
    delete: vi.fn(),
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

const COMPLETED_DOC_FILE = {
  id: 1,
  originalFilename: 'sample_maintenance.xlsx',
  fileType: 'EXCEL',
  status: 'COMPLETED',
  applied: false,
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
    assetApi.getCategories.mockResolvedValue({ data: { data: ['IT 장비', '가구'] } });
    fileApi.getAll.mockResolvedValue({ data: { data: [] } });
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
    expect(screen.getByText('파일 업로드는 관리자만 가능합니다. 아래에서 업로드된 파일을 조회할 수 있습니다.')).toBeInTheDocument();
    expect(screen.queryByText('컴퓨터에서 파일 선택')).not.toBeInTheDocument();
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
    // edit, delete 순서 중 첫 번째가 수정 버튼
    await user.click(editButtons[0]);

    expect(screen.getByRole('heading', { name: '자산 수정' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('노트북 Dell Latitude 5520')).toBeInTheDocument();
  });

  it('asks for confirmation before deleting and does not call the API when cancelled', async () => {
    const user = userEvent.setup();
    seedAdmin();
    renderPage();
    await waitFor(() => expect(screen.getByText('노트북 Dell Latitude 5520')).toBeInTheDocument());

    const deleteButtons = document.querySelectorAll('tbody tr td:last-child button');
    await user.click(deleteButtons[1]);

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
    await user.click(deleteButtons[1]);
    await user.click(screen.getByText('삭제'));

    await waitFor(() => expect(assetApi.delete).toHaveBeenCalledWith(1));
  });

  describe('유지보수 내역서/견적서 업로드 (구 파일 업로드 페이지)', () => {
    it('shows an empty state when there are no uploaded files', async () => {
      seedAdmin();
      renderPage();
      await waitFor(() => expect(screen.getByText('업로드된 파일이 없습니다.')).toBeInTheDocument());
    });

    it('renders an uploaded file with its apply action', async () => {
      seedAdmin();
      fileApi.getAll.mockResolvedValue({ data: { data: [COMPLETED_DOC_FILE] } });
      renderPage();
      await waitFor(() => expect(screen.getByText('sample_maintenance.xlsx')).toBeInTheDocument());
      expect(screen.getByText('적용')).toBeInTheDocument();
    });

    it('does not apply the file when the confirmation is cancelled', async () => {
      const user = userEvent.setup();
      seedAdmin();
      fileApi.getAll.mockResolvedValue({ data: { data: [COMPLETED_DOC_FILE] } });
      renderPage();
      await waitFor(() => expect(screen.getByText('적용')).toBeInTheDocument());

      await user.click(screen.getByText('적용'));
      expect(screen.getByText('적용하시겠습니까?')).toBeInTheDocument();
      await user.click(screen.getByText('취소'));

      expect(fileApi.apply).not.toHaveBeenCalled();
    });

    it('applies the file when the confirmation is accepted', async () => {
      const user = userEvent.setup();
      seedAdmin();
      fileApi.getAll.mockResolvedValue({ data: { data: [COMPLETED_DOC_FILE] } });
      fileApi.apply.mockResolvedValue({ data: { success: true } });
      renderPage();
      await waitFor(() => expect(screen.getByText('적용')).toBeInTheDocument());

      await user.click(screen.getByText('적용'));
      await user.click(screen.getByText('확인'));

      await waitFor(() => expect(fileApi.apply).toHaveBeenCalledWith(1));
    });

    it('shows the applied badge and an unapply button once a file has been applied', async () => {
      seedAdmin();
      fileApi.getAll.mockResolvedValue({ data: { data: [{ ...COMPLETED_DOC_FILE, applied: true }] } });
      renderPage();
      await waitFor(() => expect(screen.getByText('적용됨')).toBeInTheDocument());
      expect(screen.getByText('적용 취소')).toBeInTheDocument();
    });
  });
});

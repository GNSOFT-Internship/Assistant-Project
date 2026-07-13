import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileUpload from './FileUpload';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { fileApi } from '../services/api';

vi.mock('../services/api', () => ({
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

const COMPLETED_FILE = {
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
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <FileUpload />
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

describe('FileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fileApi.getAll.mockResolvedValue({ data: { data: [] } });
  });

  it('shows an empty state when there are no files', async () => {
    seedAdmin();
    renderPage();
    await waitFor(() => expect(screen.getByText('업로드된 파일이 없습니다.')).toBeInTheDocument());
  });

  it('shows an admin-only notice and hides the upload dropzone for a non-admin user', async () => {
    seedUser();
    renderPage();
    await waitFor(() => expect(screen.getByText('파일 업로드는 관리자만 가능합니다. 아래에서 업로드된 파일을 조회할 수 있습니다.')).toBeInTheDocument());
    expect(screen.queryByText('컴퓨터에서 파일 선택')).not.toBeInTheDocument();
  });

  it('renders an uploaded file with its apply action', async () => {
    seedAdmin();
    fileApi.getAll.mockResolvedValue({ data: { data: [COMPLETED_FILE] } });
    renderPage();
    await waitFor(() => expect(screen.getByText('sample_maintenance.xlsx')).toBeInTheDocument());
    expect(screen.getByText('적용')).toBeInTheDocument();
  });

  it('does not apply the file when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    seedAdmin();
    fileApi.getAll.mockResolvedValue({ data: { data: [COMPLETED_FILE] } });
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
    fileApi.getAll.mockResolvedValue({ data: { data: [COMPLETED_FILE] } });
    fileApi.apply.mockResolvedValue({ data: { success: true } });
    renderPage();
    await waitFor(() => expect(screen.getByText('적용')).toBeInTheDocument());

    await user.click(screen.getByText('적용'));
    await user.click(screen.getByText('확인'));

    await waitFor(() => expect(fileApi.apply).toHaveBeenCalledWith(1));
  });

  it('shows the applied badge and an unapply button once a file has been applied', async () => {
    seedAdmin();
    fileApi.getAll.mockResolvedValue({ data: { data: [{ ...COMPLETED_FILE, applied: true }] } });
    renderPage();
    await waitFor(() => expect(screen.getByText('적용됨')).toBeInTheDocument());
    expect(screen.getByText('적용 취소')).toBeInTheDocument();
  });
});

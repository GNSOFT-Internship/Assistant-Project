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
    expect(screen.queryByText('예시 파일')).not.toBeInTheDocument();
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

  it('shows example-file download links for admins', async () => {
    const user = userEvent.setup();
    seedAdmin();
    renderPage();
    await waitFor(() => expect(screen.getByText('노트북 Dell Latitude 5520')).toBeInTheDocument());

    await user.click(screen.getByText('예시 파일'));
    const assetLink = screen.getByText('자산 등록 예시 엑셀').closest('a');
    const maintLink = screen.getByText('유지보수 내역서 예시 엑셀 (정상+불일치 혼합)').closest('a');
    const maintUnmatchedLink = screen.getByText('유지보수 내역서 예시 엑셀 (전체 불일치)').closest('a');
    const maintErrorLink = screen.getByText('유지보수 내역서 예시 엑셀 (오류 행 포함)').closest('a');
    expect(assetLink).toHaveAttribute('href', '/templates/자산등록_예시.xlsx');
    expect(maintLink).toHaveAttribute('href', '/templates/유지보수내역서_예시.xlsx');
    expect(maintUnmatchedLink).toHaveAttribute('href', '/templates/유지보수내역서_전체불일치_예시.xlsx');
    expect(maintErrorLink).toHaveAttribute('href', '/templates/유지보수내역서_오류행포함_예시.xlsx');
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

  describe('파일 업로드 (자산 등록 / 유지보수 내역서·견적서, 자동 판별)', () => {
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

    it('paginates the uploaded file list 5 at a time with prev/next controls', async () => {
      const user = userEvent.setup();
      seedAdmin();
      const sevenFiles = Array.from({ length: 7 }, (_, i) => ({
        ...COMPLETED_DOC_FILE,
        id: i + 1,
        originalFilename: `file_${i + 1}.xlsx`,
      }));
      fileApi.getAll.mockResolvedValue({ data: { data: sevenFiles } });
      renderPage();

      await waitFor(() => expect(screen.getByText('file_1.xlsx')).toBeInTheDocument());
      expect(screen.getByText('file_5.xlsx')).toBeInTheDocument();
      expect(screen.queryByText('file_6.xlsx')).not.toBeInTheDocument();
      expect(screen.getByText('1 / 2')).toBeInTheDocument();

      await user.click(screen.getByLabelText('업로드 파일 다음 페이지'));
      await waitFor(() => expect(screen.getByText('file_6.xlsx')).toBeInTheDocument());
      expect(screen.getByText('file_7.xlsx')).toBeInTheDocument();
      expect(screen.queryByText('file_1.xlsx')).not.toBeInTheDocument();
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
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

    it('renders auto-detected asset-registration files without an unapply button', async () => {
      seedAdmin();
      fileApi.getAll.mockResolvedValue({
        data: {
          data: [{
            id: 2,
            originalFilename: 'sample_asset_registration.xlsx',
            fileType: 'EXCEL',
            status: 'COMPLETED',
            applied: true,
            extractedSummary: {
              kind: 'asset_registration',
              totalRows: 1,
              validRows: 1,
              errorRowCount: 0,
              errorRows: [],
              duplicateAssetCodes: [],
              rows: [{ row: 2, assetCode: 'FILEREG-001', assetName: '테스트 자산', category: 'IT 장비', assetExists: false }],
              appliedAssetCount: 1,
            },
          }],
        },
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('sample_asset_registration.xlsx')).toBeInTheDocument());
      expect(screen.getByText('등록된 자산: 1건')).toBeInTheDocument();
      expect(screen.queryByText('적용 취소')).not.toBeInTheDocument();
    });

    it('hides the apply button when every asset-registration row is a duplicate', async () => {
      seedAdmin();
      fileApi.getAll.mockResolvedValue({
        data: {
          data: [{
            id: 3,
            originalFilename: 'all_duplicates.xlsx',
            fileType: 'EXCEL',
            status: 'COMPLETED',
            applied: false,
            extractedSummary: {
              kind: 'asset_registration',
              totalRows: 1,
              validRows: 1,
              errorRowCount: 0,
              errorRows: [],
              duplicateAssetCodes: ['IT-001'],
              rows: [{ row: 2, assetCode: 'IT-001', assetName: '중복 자산', category: 'IT 장비', assetExists: true }],
              appliedAssetCount: null,
            },
          }],
        },
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('all_duplicates.xlsx')).toBeInTheDocument());
      expect(screen.getByText('적용 가능한 항목 없음')).toBeInTheDocument();
      expect(screen.queryByText('적용')).not.toBeInTheDocument();
    });

    it('hides the apply button when every maintenance row has an unmatched asset code', async () => {
      seedAdmin();
      fileApi.getAll.mockResolvedValue({
        data: {
          data: [{
            id: 4,
            originalFilename: 'all_unmatched.xlsx',
            fileType: 'EXCEL',
            status: 'COMPLETED',
            applied: false,
            extractedSummary: {
              kind: 'maintenance_records',
              totalRows: 1,
              validRows: 1,
              errorRowCount: 0,
              errorRows: [],
              unmatchedAssetCodes: ['ZZZ-999'],
              records: [{ row: 2, assetCode: 'ZZZ-999', assetExists: false, maintenanceDate: '2026-06-22', maintenanceType: 'REPAIR', cost: 30000, description: null }],
              appliedRecordCount: null,
            },
          }],
        },
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('all_unmatched.xlsx')).toBeInTheDocument());
      expect(screen.getByText('적용 가능한 항목 없음')).toBeInTheDocument();
      expect(screen.queryByText('적용')).not.toBeInTheDocument();
    });

    it('shows asset-registration error rows highlighted in red inside the row preview', async () => {
      const user = userEvent.setup();
      seedAdmin();
      fileApi.getAll.mockResolvedValue({
        data: {
          data: [{
            id: 5,
            originalFilename: 'has_errors.xlsx',
            fileType: 'EXCEL',
            status: 'COMPLETED',
            applied: false,
            extractedSummary: {
              kind: 'asset_registration',
              totalRows: 2,
              validRows: 1,
              errorRowCount: 1,
              errorRows: [{ row: 3, error: '자산명: 값이 비어있습니다.' }],
              duplicateAssetCodes: [],
              rows: [{ row: 2, assetCode: 'IT-950', assetName: '정상 자산', category: 'IT 장비', assetExists: false }],
              appliedAssetCount: null,
            },
          }],
        },
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('has_errors.xlsx')).toBeInTheDocument());

      await user.click(screen.getByText(/행별 미리보기/));
      expect(screen.getByText('자산명: 값이 비어있습니다.')).toBeInTheDocument();
      const errorRow = screen.getByText('자산명: 값이 비어있습니다.').closest('tr');
      expect(errorRow.className).toContain('bg-red-50');
    });

    it('shows maintenance error rows highlighted in red inside the row preview', async () => {
      const user = userEvent.setup();
      seedAdmin();
      fileApi.getAll.mockResolvedValue({
        data: {
          data: [{
            id: 6,
            originalFilename: 'maint_has_errors.xlsx',
            fileType: 'EXCEL',
            status: 'COMPLETED',
            applied: false,
            extractedSummary: {
              kind: 'maintenance_records',
              totalRows: 2,
              validRows: 1,
              errorRowCount: 1,
              errorRows: [{ row: 3, reason: '정비일 형식 오류: 미정' }],
              unmatchedAssetCodes: [],
              records: [{ row: 2, assetCode: 'IT-001', assetExists: true, maintenanceDate: '2026-06-10', maintenanceType: 'REPAIR', cost: 45000, description: '정상' }],
              appliedRecordCount: null,
            },
          }],
        },
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('maint_has_errors.xlsx')).toBeInTheDocument());

      await user.click(screen.getByText(/행별 미리보기/));
      expect(screen.getByText('정비일 형식 오류: 미정')).toBeInTheDocument();
      const errorRow = screen.getByText('정비일 형식 오류: 미정').closest('tr');
      expect(errorRow.className).toContain('bg-red-50');
    });
  });
});

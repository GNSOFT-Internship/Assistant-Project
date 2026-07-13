import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';
import { AuthProvider } from '../context/AuthContext';
import { authApi } from '../services/api';

vi.mock('../services/api', () => ({
  authApi: { login: vi.fn() },
}));

function renderPage() {
  return render(
    <AuthProvider>
      <Login />
    </AuthProvider>
  );
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the login form', () => {
    renderPage();
    expect(screen.getByPlaceholderText('사용자명을 입력하세요')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('비밀번호를 입력하세요')).toBeInTheDocument();
  });

  it('shows an error message when login fails', async () => {
    const user = userEvent.setup();
    authApi.login.mockResolvedValue({ data: { success: false, message: null } });
    renderPage();

    await user.type(screen.getByPlaceholderText('사용자명을 입력하세요'), 'admin');
    await user.type(screen.getByPlaceholderText('비밀번호를 입력하세요'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => expect(screen.getByText('아이디 또는 비밀번호가 잘못되었습니다')).toBeInTheDocument());
  });

  it('falls back to the generic error message when the request itself throws', async () => {
    // AuthContext.login()이 네트워크 에러도 내부에서 잡아 { success: false }로
    // 반환하므로, Login.jsx의 catch 블록("로그인 중 오류가 발생했습니다")이 아니라
    // !result.success 분기의 기본 메시지가 뜬다.
    const user = userEvent.setup();
    authApi.login.mockRejectedValue(new Error('network error'));
    renderPage();

    await user.type(screen.getByPlaceholderText('사용자명을 입력하세요'), 'admin');
    await user.type(screen.getByPlaceholderText('비밀번호를 입력하세요'), 'admin123');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => expect(screen.getByText('아이디 또는 비밀번호가 잘못되었습니다')).toBeInTheDocument());
  });

  it('stores the auth token and clears the error on a successful login', async () => {
    const user = userEvent.setup();
    authApi.login.mockResolvedValue({
      data: { data: { token: 'abc123', username: 'admin', role: 'ADMIN' } },
    });
    renderPage();

    await user.type(screen.getByPlaceholderText('사용자명을 입력하세요'), 'admin');
    await user.type(screen.getByPlaceholderText('비밀번호를 입력하세요'), 'admin123');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => expect(JSON.parse(localStorage.getItem('auth_user')).token).toBe('abc123'));
    expect(screen.queryByText('아이디 또는 비밀번호가 잘못되었습니다')).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './ToastContext';

function ToastTrigger() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('성공했습니다')}>success</button>
      <button onClick={() => toast.error('실패했습니다')}>error</button>
      <button onClick={() => toast.info('짧게 알려드려요', 100)}>short</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <ToastTrigger />
    </ToastProvider>
  );
}

describe('ToastContext', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a success toast when triggered', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    await user.click(screen.getByText('success'));
    expect(screen.getByText('성공했습니다')).toBeInTheDocument();
  });

  it('shows an error toast independently of success toasts', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    await user.click(screen.getByText('error'));
    expect(screen.getByText('실패했습니다')).toBeInTheDocument();
  });

  it('lets the user dismiss a toast manually', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    await user.click(screen.getByText('success'));
    const message = screen.getByText('성공했습니다');
    const dismissButton = message.parentElement.querySelector('button[aria-label="닫기"]');
    await user.click(dismissButton);
    expect(screen.queryByText('성공했습니다')).not.toBeInTheDocument();
  });

  it('auto-dismisses a toast after its duration elapses', async () => {
    vi.useFakeTimers();
    renderWithProvider();
    fireEvent.click(screen.getByText('short'));
    expect(screen.getByText('짧게 알려드려요')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.queryByText('짧게 알려드려요')).not.toBeInTheDocument();
  });

  it('throws a clear error when useToast is used outside the provider', () => {
    const BareComponent = () => {
      useToast();
      return null;
    };
    // React logs an error to console for the thrown render error; suppress noise for this assertion.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BareComponent />)).toThrow('useToast는 ToastProvider 내부에서만 사용할 수 있습니다.');
    spy.mockRestore();
  });
});

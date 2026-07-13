import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider, useConfirm } from './ConfirmContext';

function ConfirmTrigger({ onResult, options }) {
  const confirmDialog = useConfirm();
  const handleClick = async () => {
    const result = await confirmDialog('정말 삭제하시겠습니까?', options);
    onResult(result);
  };
  return <button onClick={handleClick}>삭제 시도</button>;
}

function renderWithProvider(onResult, options) {
  return render(
    <ConfirmProvider>
      <ConfirmTrigger onResult={onResult} options={options} />
    </ConfirmProvider>
  );
}

describe('ConfirmContext', () => {
  it('resolves true when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProvider(onResult);

    await user.click(screen.getByText('삭제 시도'));
    expect(screen.getByText('정말 삭제하시겠습니까?')).toBeInTheDocument();

    await user.click(screen.getByText('확인'));
    expect(onResult).toHaveBeenCalledWith(true);
    expect(screen.queryByText('정말 삭제하시겠습니까?')).not.toBeInTheDocument();
  });

  it('resolves false when cancelled', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProvider(onResult);

    await user.click(screen.getByText('삭제 시도'));
    await user.click(screen.getByText('취소'));
    expect(onResult).toHaveBeenCalledWith(false);
  });

  it('resolves false when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProvider(onResult);

    await user.click(screen.getByText('삭제 시도'));
    const backdrop = screen.getByText('정말 삭제하시겠습니까?').closest('.fixed');
    await user.click(backdrop);
    expect(onResult).toHaveBeenCalledWith(false);
  });

  it('uses custom confirm/cancel labels when provided', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProvider(onResult, { confirmLabel: '삭제', danger: true });

    await user.click(screen.getByText('삭제 시도'));
    const confirmButton = screen.getByText('삭제');
    expect(confirmButton).toBeInTheDocument();
    await user.click(confirmButton);
    expect(onResult).toHaveBeenCalledWith(true);
  });
});

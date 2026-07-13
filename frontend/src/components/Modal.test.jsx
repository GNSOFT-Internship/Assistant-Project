import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        <p>내용</p>
      </Modal>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders children when open', () => {
    render(
      <Modal open onClose={() => {}}>
        <p>모달 내용입니다</p>
      </Modal>
    );
    expect(screen.getByText('모달 내용입니다')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>내용</p>
      </Modal>
    );
    // 배경(오버레이) 자체는 텍스트가 없으므로 role/testid 없이 텍스트 노드의 조상을 통해 접근
    const backdrop = screen.getByText('내용').closest('.fixed');
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the content', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>클릭해도 안 닫힘</p>
      </Modal>
    );
    await user.click(screen.getByText('클릭해도 안 닫힘'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

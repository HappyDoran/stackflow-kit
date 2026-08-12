/**
 * @jest-environment jsdom
 *
 * 스와이프 백 훅의 락 연동 분기 검증:
 * - 락이 잡혀 있으면 제스처를 시작하지 않는다
 * - 제스처 도중 다른 네비게이션이 락을 잡으면 커밋하지 않는다
 * - touchcancel은 절대 커밋하지 않는다
 */
import { useSpringSwipeBack } from '@happydoran/stackflow-kit';
import { navigationLock } from '@happydoran/stackflow-kit/navigation-lock';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Callbacks = {
  onSwipeStart?: () => void;
  onSwipeEnd?: (args: { swiped: boolean }) => void;
  onTransitionEnd?: (args: { swiped: boolean }) => void;
};

function Harness({ callbacks }: { callbacks: Callbacks }) {
  const paperRef = useRef<HTMLDivElement>(null!);
  const edgeRef = useRef<HTMLDivElement>(null!);
  useSpringSwipeBack({ paperRef, edgeRef, preventSwipeBack: false, ...callbacks });
  return (
    <div>
      <div ref={paperRef} data-testid="paper" />
      <div ref={edgeRef} data-testid="edge" />
    </div>
  );
}

// jsdom에는 Touch/TouchEvent 생성자가 없어 Event에 터치 배열을 얹어 흉내냅니다.
function touchEvent(type: string, touches: Array<{ identifier: number; clientX: number; clientY: number }>) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { touches, changedTouches: touches });
  return event;
}

describe('useSpringSwipeBack × nav lock', () => {
  let container: HTMLDivElement;
  let root: Root;
  let edge: HTMLElement;
  let callbacks: Required<Callbacks>;

  const mount = () => {
    act(() => {
      root.render(<Harness callbacks={callbacks} />);
    });
    edge = container.querySelector('[data-testid="edge"]')!;
    // clientWidth는 jsdom에서 0이므로 캐시 시점에 유효한 값이 잡히도록 지정합니다.
    const paper = container.querySelector('[data-testid="paper"]')!;
    Object.defineProperty(paper, 'clientWidth', { value: 375, configurable: true });
  };

  beforeEach(() => {
    navigationLock.release();
    callbacks = {
      onSwipeStart: jest.fn(),
      onSwipeEnd: jest.fn(),
      onTransitionEnd: jest.fn(),
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mount();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    navigationLock.release();
  });

  const swipeRight = (id = 1) => {
    act(() => {
      edge.dispatchEvent(touchEvent('touchstart', [{ identifier: id, clientX: 5, clientY: 300 }]));
      edge.dispatchEvent(touchEvent('touchmove', [{ identifier: id, clientX: 60, clientY: 300 }]));
      edge.dispatchEvent(touchEvent('touchmove', [{ identifier: id, clientX: 200, clientY: 300 }]));
    });
  };

  it('락이 잡혀 있으면 제스처를 시작하지 않는다', () => {
    navigationLock.acquire();
    swipeRight();
    act(() => {
      edge.dispatchEvent(touchEvent('touchend', [{ identifier: 1, clientX: 200, clientY: 300 }]));
    });
    expect(callbacks.onSwipeStart).not.toHaveBeenCalled();
    expect(callbacks.onSwipeEnd).not.toHaveBeenCalled();
  });

  it('제스처 도중 다른 네비게이션이 락을 잡으면 커밋하지 않는다', () => {
    swipeRight();
    expect(callbacks.onSwipeStart).toHaveBeenCalled();

    navigationLock.acquire(); // 버튼 pop 등 다른 네비게이션 개입
    act(() => {
      edge.dispatchEvent(touchEvent('touchend', [{ identifier: 1, clientX: 200, clientY: 300 }]));
    });
    expect(callbacks.onSwipeEnd).toHaveBeenCalledWith({ swiped: false });
  });

  it('충분히 드래그하고 락이 없으면 커밋한다', () => {
    swipeRight();
    act(() => {
      edge.dispatchEvent(touchEvent('touchend', [{ identifier: 1, clientX: 200, clientY: 300 }]));
    });
    expect(callbacks.onSwipeEnd).toHaveBeenCalledWith({ swiped: true });
  });

  it('touchcancel은 절대 커밋하지 않는다', () => {
    swipeRight();
    act(() => {
      edge.dispatchEvent(touchEvent('touchcancel', [{ identifier: 1, clientX: 200, clientY: 300 }]));
    });
    expect(callbacks.onSwipeEnd).toHaveBeenCalledWith({ swiped: false });
  });

  it('다른 손가락의 종료는 제스처를 끝내지 않는다', () => {
    swipeRight(1);
    act(() => {
      edge.dispatchEvent(touchEvent('touchend', [{ identifier: 2, clientX: 10, clientY: 10 }]));
    });
    expect(callbacks.onSwipeEnd).not.toHaveBeenCalled();
  });
});

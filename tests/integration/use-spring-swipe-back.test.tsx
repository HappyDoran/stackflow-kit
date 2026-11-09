/**
 * @jest-environment jsdom
 *
 * 스와이프 백 훅의 락 연동 분기 검증:
 * - 락이 잡혀 있으면 제스처를 시작하지 않는다
 * - 제스처 도중 다른 네비게이션이 락을 잡으면 커밋하지 않는다
 * - touchcancel은 절대 커밋하지 않는다
 *
 * 화면 추적:
 * - 가로 판정 지점부터 따라가 판정 거리만큼 튀지 않는다
 * - dim은 진행만큼 옅어지고, 취소하면 화면이 넣어 둔 전환 설정으로 되돌아간다
 * - 뒷 페이지는 취소하면 평상시 패럴랙스 위치로, 커밋하면 제자리로 가고 전환 설정은 지워지지 않는다
 */
import { useSpringSwipeBack } from '@happydoran/stackflow-kit';
import { navigationLock } from '@happydoran/stackflow-kit/navigation-lock';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAPER_TRANSITION = 'transform 350ms ease';
const DIM_TRANSITION = 'opacity 350ms ease';
const BACKGROUND_OFFSET = 'translate3d(-30%, 0, 0)';

const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 200 && !condition(); i += 1) {
    await act(() => new Promise<void>(resolve => setTimeout(resolve, 10)));
  }
};

const nextFrame = () => act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));

type Callbacks = {
  onSwipeStart?: () => void;
  onSwipeEnd?: (args: { swiped: boolean }) => void;
  onTransitionEnd?: (args: { swiped: boolean }) => void;
};

function Harness({ callbacks }: { callbacks: Callbacks }) {
  const paperRef = useRef<HTMLDivElement>(null!);
  const edgeRef = useRef<HTMLDivElement>(null!);
  const dimRef = useRef<HTMLDivElement>(null);
  useSpringSwipeBack({ paperRef, edgeRef, dimRef, preventSwipeBack: false, ...callbacks });
  return (
    <div>
      <div data-stackflow-component-name="AppScreen">
        <div
          className="stackflow-kit-screen__paper"
          data-testid="background"
          style={{ transform: BACKGROUND_OFFSET, transition: PAPER_TRANSITION }}
        />
      </div>
      <div data-stackflow-component-name="AppScreen">
        <div ref={dimRef} data-testid="dim" style={{ transition: DIM_TRANSITION }} />
        <div ref={paperRef} data-testid="paper" style={{ transition: PAPER_TRANSITION }} />
        <div ref={edgeRef} data-testid="edge" />
      </div>
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

  it('가로 판정 지점부터 따라가고 dim은 진행만큼 옅어진다', async () => {
    swipeRight(); // 5에서 시작, 60에서 가로 판정, 200까지 이동
    await nextFrame();

    const paper = container.querySelector<HTMLElement>('[data-testid="paper"]')!;
    const dim = container.querySelector<HTMLElement>('[data-testid="dim"]')!;
    expect(paper.style.transform).toBe('translate3d(140px, 0, 0)');
    expect(Number(dim.style.opacity)).toBeCloseTo(1 - 140 / 375);
  });

  it('취소하면 dim과 앞 페이지가 처음 전환 설정으로 돌아간다', async () => {
    act(() => {
      edge.dispatchEvent(touchEvent('touchstart', [{ identifier: 1, clientX: 5, clientY: 300 }]));
      edge.dispatchEvent(touchEvent('touchmove', [{ identifier: 1, clientX: 30, clientY: 300 }]));
    });
    await nextFrame();
    const paper = container.querySelector<HTMLElement>('[data-testid="paper"]')!;
    const dim = container.querySelector<HTMLElement>('[data-testid="dim"]')!;
    expect(paper.style.transition).toBe('none');

    // 판정 지점에서 그대로 떼면 이동량이 없어 스프링 없이 바로 정리된다
    act(() => {
      edge.dispatchEvent(touchEvent('touchend', [{ identifier: 1, clientX: 30, clientY: 300 }]));
    });
    expect(callbacks.onTransitionEnd).toHaveBeenCalledWith({ swiped: false });
    expect(paper.style.transition).toBe(PAPER_TRANSITION);
    expect(dim.style.transition).toBe(DIM_TRANSITION);
    expect(dim.style.opacity).toBe('');
  });

  it('취소하면 뒷 페이지가 평상시 패럴랙스 위치와 전환 설정으로 돌아간다', async () => {
    const background = container.querySelector<HTMLElement>('[data-testid="background"]')!;
    const offset = background.style.transform;
    act(() => {
      edge.dispatchEvent(touchEvent('touchstart', [{ identifier: 1, clientX: 5, clientY: 300 }]));
      edge.dispatchEvent(touchEvent('touchmove', [{ identifier: 1, clientX: 30, clientY: 300 }]));
      edge.dispatchEvent(touchEvent('touchend', [{ identifier: 1, clientX: 30, clientY: 300 }]));
    });

    expect(background.style.transform).toBe(offset);
    await waitFor(() => background.style.transition === PAPER_TRANSITION);
    expect(background.style.transition).toBe(PAPER_TRANSITION);
  });

  it('커밋하면 뒷 페이지는 제자리로 가고 전환 설정은 그대로 둔다', async () => {
    swipeRight();
    act(() => {
      edge.dispatchEvent(touchEvent('touchend', [{ identifier: 1, clientX: 200, clientY: 300 }]));
    });
    await waitFor(() => (callbacks.onTransitionEnd as jest.Mock).mock.calls.length > 0);

    const background = container.querySelector<HTMLElement>('[data-testid="background"]')!;
    expect(callbacks.onTransitionEnd).toHaveBeenCalledWith({ swiped: true });
    expect(background.style.transform).toBe('');
    expect(background.style.transition).toBe(PAPER_TRANSITION);
  });
});

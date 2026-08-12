/**
 * @jest-environment jsdom
 */
import { StackScreen, type StackflowRuntimeAdapter } from '@happydoran/stackflow-kit';
import { navigationLock } from '@happydoran/stackflow-kit/navigation-lock';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockActions = {
  pop: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
};

let mockActivity = {
  isRoot: true,
  isTop: true,
  transitionState: 'enter-done',
};

let mockStack = {
  globalTransitionState: 'idle',
  activities: [{ name: 'HomeActivity', transitionState: 'enter-done' }],
};

jest.mock('@stackflow/react', () => ({
  useActions: () => mockActions,
  useStack: () => mockStack,
}));

jest.mock('@stackflow/react-ui-core', () => ({
  useNullableActivity: () => mockActivity,
  usePreventTouchDuringTransition: () => {},
  useStyleEffectOffset: () => {},
}));

describe('StackScreen runtime adapter', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    navigationLock.release();
    mockActivity = { isRoot: true, isTop: true, transitionState: 'enter-done' };
    mockStack = {
      globalTransitionState: 'idle',
      activities: [{ name: 'HomeActivity', transitionState: 'enter-done' }],
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    navigationLock.release();
  });

  it('기본 browser runtime은 bridge 없이 header와 content slot을 렌더링한다', () => {
    act(() => {
      root.render(
        <StackScreen
          renderContent={(content) => <main data-testid="content">{content}</main>}
          renderHeader={({ isRoot }) => <header data-testid="header">{String(isRoot)}</header>}
        >
          화면 내용
        </StackScreen>
      );
    });

    expect(container.querySelector('[data-stackflow-component-name="AppScreen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="header"]')?.textContent).toBe('true');
    expect(container.querySelector('[data-testid="content"]')?.textContent).toBe('화면 내용');
  });

  it('주입한 runtime은 stack state를 받고 back press를 guarded pop으로 전달한다', () => {
    mockActivity = { isRoot: false, isTop: true, transitionState: 'enter-done' };
    mockStack = {
      globalTransitionState: 'idle',
      activities: [
        { name: 'HomeActivity', transitionState: 'enter-done' },
        { name: 'DetailActivity', transitionState: 'enter-done' },
      ],
    };

    let backPressHandler: (() => void) | undefined;
    const runtimeAdapter: StackflowRuntimeAdapter = {
      publishStackState: jest.fn(),
      subscribeBackPress: (handler) => {
        backPressHandler = handler;
        return jest.fn();
      },
    };

    act(() => {
      root.render(<StackScreen preventSwipeBack={false} runtimeAdapter={runtimeAdapter} />);
    });

    expect(runtimeAdapter.publishStackState).toHaveBeenCalledWith({ canGoBack: true });
    act(() => backPressHandler?.());
    expect(mockActions.pop).toHaveBeenCalledTimes(1);
  });
});

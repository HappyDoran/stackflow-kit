/**
 * @jest-environment jsdom
 */
import { useStackNavigation } from '@happydoran/stackflow-kit';
import { navigationLock } from '@happydoran/stackflow-kit/navigation-lock';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockActions = {
  pop: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
};

let mockStack = {
  globalTransitionState: 'idle',
  activities: [{ name: 'HomeActivity', transitionState: 'enter-done' }],
};

jest.mock('@stackflow/react', () => ({
  useActions: () => mockActions,
  useStack: () => mockStack,
}));

let navigation: ReturnType<typeof useStackNavigation>;

function Harness() {
  navigation = useStackNavigation();
  return null;
}

describe('useStackNavigation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    navigationLock.release();
    mockStack = {
      globalTransitionState: 'idle',
      activities: [{ name: 'HomeActivity', transitionState: 'enter-done' }],
    };
    container = document.createElement('div');
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    navigationLock.release();
  });

  it('같은 렌더 사이클의 연속 push는 첫 action만 실행한다', () => {
    act(() => {
      navigation.push('BodyAnalysisGuideActivity');
      navigation.push('BodyAnalysisMeasureActivity');
    });

    expect(mockActions.push).toHaveBeenCalledTimes(1);
    expect(mockActions.push).toHaveBeenCalledWith('BodyAnalysisGuideActivity', {}, undefined);
  });

  it('root activity에서는 pop을 실행하거나 lock을 잡지 않는다', () => {
    act(() => navigation.pop());

    expect(mockActions.pop).not.toHaveBeenCalled();
    expect(navigationLock.isLocked()).toBe(false);
  });

  it('StackFlow 전이 중에는 새로운 action을 실행하지 않는다', () => {
    mockStack = { ...mockStack, globalTransitionState: 'transitioning' };
    act(() => root.render(<Harness />));

    act(() => navigation.replace('BodyAnalysisGuideActivity'));

    expect(mockActions.replace).not.toHaveBeenCalled();
    expect(navigation.isTransitioning).toBe(true);
  });

  it('replaceTab은 exit activity를 제외한 depth를 정리하고 animate 없이 교체한다', () => {
    mockStack = {
      globalTransitionState: 'idle',
      activities: [
        { name: 'HomeActivity', transitionState: 'enter-done' },
        { name: 'BodyAnalysisGuideActivity', transitionState: 'enter-done' },
        { name: 'BodyAnalysisMeasureActivity', transitionState: 'exit-active' },
      ],
    };
    act(() => root.render(<Harness />));

    act(() => navigation.replaceTab('HomeActivity', { guest: true }));

    expect(mockActions.pop).toHaveBeenCalledWith(1, { animate: false });
    expect(mockActions.replace).toHaveBeenCalledWith('HomeActivity', { guest: true }, { animate: false });
  });
});

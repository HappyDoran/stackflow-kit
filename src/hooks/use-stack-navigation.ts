'use client';

import { useActions, useStack } from '@stackflow/react';
import type { StackActivityRegistry } from '../index.js';
import { useNavLockStore } from '../stores/nav-lock.state.js';

/**
 * 앱 설정(stackflow config)이 선언 병합(declaration merging)으로 채우는
 * activity 이름 레지스트리. shared가 app 레이어를 import하지 않고도
 * push/replace의 activity 이름 오타를 컴파일 타임에 잡습니다.
 */
export type ActivityName = keyof StackActivityRegistry extends never
  ? string // 레지스트리가 비어 있으면(등록 전) string으로 동작
  : keyof StackActivityRegistry & string;

export type ActivityParams<Name extends ActivityName> = keyof StackActivityRegistry extends never
  ? Record<string, unknown>
  : Name extends keyof StackActivityRegistry
    ? StackActivityRegistry[Name] extends object
      ? StackActivityRegistry[Name]
      : never
    : Record<string, unknown>;

export type NavigationOptions = { animate?: boolean };

type NavigationArgs<Name extends ActivityName> = {} extends ActivityParams<Name>
  ? [params?: ActivityParams<Name>, options?: NavigationOptions]
  : [params: ActivityParams<Name>, options?: NavigationOptions];

type ParamsArgs<Name extends ActivityName> = {} extends ActivityParams<Name>
  ? [params?: ActivityParams<Name>]
  : [params: ActivityParams<Name>];

export type StackNavigation = {
  isTransitioning: boolean;
  pop: (options?: NavigationOptions) => void;
  push: <Name extends ActivityName>(activityName: Name, ...args: NavigationArgs<Name>) => void;
  replace: <Name extends ActivityName>(activityName: Name, ...args: NavigationArgs<Name>) => void;
  replaceTab: <Name extends ActivityName>(activityName: Name, ...args: ParamsArgs<Name>) => void;
};

const getActiveActivities = (activities: ReturnType<typeof useStack>['activities']) =>
  activities.filter(activity => !activity.transitionState.startsWith('exit'));

export function useStackNavigation(): StackNavigation {
  const flow = useActions();
  const stack = useStack();
  const isIdle = stack.globalTransitionState === 'idle';

  // 버튼 disabled 등 UI 표시를 위해 락 상태를 구독합니다. silent 락은 표시하지 않습니다.
  const locked = useNavLockStore(state => state.locked && !state.silent);

  /**
   * 네비게이션 가능 여부를 렌더 사이클과 무관하게 동기적으로 판단합니다.
   * 클로저에 캡처된 값이 아닌 스토어의 최신 값을 읽으므로
   * 같은 프레임 내 연타도 첫 번째 액션만 통과합니다.
   */
  const canNavigate = () => !useNavLockStore.getState().locked && isIdle;

  /**
   * 락을 걸고 액션을 실행합니다.
   *
   * - animate가 true(기본)인 경우: 전이가 시작되어 globalTransitionState가 변하므로
   *   StackScreen의 idle 복귀 옵저버가 락을 해제합니다.
   * - animate가 false인 경우: globalTransitionState가 idle을 유지할 수 있어
   *   자동 해제가 걸리지 않으므로, 이 동작이 소유한 토큰으로 다음 프레임에 직접 해제합니다.
   */
  const runLocked = (options: NavigationOptions | undefined, action: () => void) => {
    const token = useNavLockStore.getState().lock();
    action();
    if (options?.animate === false) {
      requestAnimationFrame(() => useNavLockStore.getState().unlock(token));
    }
  };

  const push = <Name extends ActivityName>(activityName: Name, ...args: NavigationArgs<Name>) => {
    if (!canNavigate()) return;
    const params = (args[0] ?? {}) as unknown as Record<string, unknown>;
    const options = args[1];
    runLocked(options, () => flow.push(activityName, params, options));
  };

  const replace = <Name extends ActivityName>(activityName: Name, ...args: NavigationArgs<Name>) => {
    if (!canNavigate()) return;
    const params = (args[0] ?? {}) as unknown as Record<string, unknown>;
    const options = args[1];
    runLocked(options, () => flow.replace(activityName, params, options));
  };

  const replaceTab = <Name extends ActivityName>(activityName: Name, ...args: ParamsArgs<Name>) => {
    if (!canNavigate()) return;

    const params = (args[0] ?? {}) as unknown as Record<string, unknown>;
    const activities = getActiveActivities(stack.activities);
    const depth = activities.length;
    const options = { animate: false };

    if (depth === 1 && activities[0]?.name === activityName) return;

    const token = useNavLockStore.getState().lock();
    // pop과 replace를 같은 틱에 디스패치해 중간 상태가 렌더되지 않도록 합니다.
    // (historySyncPlugin의 requestHistoryTick이 직렬화 큐라 히스토리 순서는 보장됨)
    if (depth > 1) flow.pop(depth - 1, options);
    flow.replace(activityName, params, options);
    // animate:false라 globalTransitionState가 idle을 유지할 수 있어
    // 이 동작이 소유한 토큰으로 명시적으로 해제합니다.
    requestAnimationFrame(() => useNavLockStore.getState().unlock(token));
  };

  const pop = (options?: NavigationOptions) => {
    const depth = getActiveActivities(stack.activities).length;
    if (!canNavigate() || depth <= 1) return;
    runLocked(options, () => {
      if (options) {
        flow.pop(options);
      } else {
        flow.pop();
      }
    });
  };

  return {
    isTransitioning: !isIdle || locked,
    pop,
    push,
    replace,
    replaceTab,
  };
}

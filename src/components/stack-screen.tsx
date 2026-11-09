'use client';

import { useActions, useStack } from '@stackflow/react';
import { useNullableActivity, usePreventTouchDuringTransition } from '@stackflow/react-ui-core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PARALLAX_OFFSET_RATIO, STACK_TRANSITION_DURATION_MS, STACK_TRANSITION_EASING } from '../constants/stack-transition.constant.js';
import { getBackgroundPaper, useSpringSwipeBack } from '../hooks/use-spring-swipe-back.js';
import { useStackNavigation } from '../hooks/use-stack-navigation.js';
import type { StackflowRuntimeAdapter } from '../runtime/stackflow-runtime-adapter.js';
import { useNavLockStore } from '../stores/nav-lock.state.js';

export type StackScreenRenderContext = {
  isRoot: boolean;
  isTransitioning: boolean;
  pop: () => void;
};

export type StackScreenClassNames = {
  content?: string;
  dim?: string;
  edge?: string;
  paper?: string;
  root?: string;
  touchBlocker?: string;
};

export type StackScreenProps = {
  backgroundColor?: string;
  children?: ReactNode;
  classNames?: StackScreenClassNames;
  contentStyle?: CSSProperties;
  preventSwipeBack?: boolean;
  renderContent?: (children: ReactNode) => ReactNode;
  renderHeader?: (context: StackScreenRenderContext) => ReactNode;
  runtimeAdapter?: StackflowRuntimeAdapter;
};

const joinClassNames = (...classNames: Array<string | undefined>) => classNames.filter(Boolean).join(' ') || undefined;

const rootStyle: CSSProperties = {
  backgroundColor: 'transparent',
  height: '100%',
  inset: 0,
  overflow: 'hidden',
  position: 'absolute',
  width: '100%',
};

const dimStyle: CSSProperties = {
  // iOS처럼 뒷 페이지를 살짝만 어둡게 한다
  backgroundColor: 'rgb(0 0 0 / 0.1)',
  inset: 0,
  position: 'absolute',
  // 스와이프 훅이 style.transition으로 읽고 되돌리므로 shorthand로 둔다
  transition: `opacity ${STACK_TRANSITION_DURATION_MS}ms ${STACK_TRANSITION_EASING}`,
  zIndex: 0,
};

const touchBlockerStyle: CSSProperties = {
  backgroundColor: 'transparent',
  display: 'none',
  inset: 0,
  pointerEvents: 'auto',
  position: 'absolute',
  touchAction: 'none',
  zIndex: 2147483647,
};

const paperTransition = `transform ${STACK_TRANSITION_DURATION_MS}ms ${STACK_TRANSITION_EASING}`;
const backgroundOffsetTransform = `translate3d(-${PARALLAX_OFFSET_RATIO * 100}%, 0, 0)`;

const paperStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  inset: 0,
  position: 'absolute',
  // 스와이프 훅과 뒷 페이지 패럴랙스가 style.transition으로 읽고 되돌리므로 shorthand로 둔다
  transition: paperTransition,
  width: '100%',
  zIndex: 10,
};

const contentStyle: CSSProperties = {
  flex: '1 1 0%',
  minHeight: 0,
  overflow: 'hidden',
};

const edgeStyle: CSSProperties = {
  backgroundColor: 'transparent',
  bottom: 0,
  cursor: 'grab',
  left: 0,
  position: 'absolute',
  top: 0,
  touchAction: 'pan-y',
  width: 20,
  zIndex: 50,
};

/**
 * StackFlow navigation, lock, swipe lifecycle을 소유하는 runtime-agnostic screen입니다.
 * AppBar, content layout, styling, native bridge는 render prop과 runtime adapter로 주입합니다.
 */
export function StackScreen({
  backgroundColor = 'white',
  children,
  classNames,
  contentStyle: injectedContentStyle,
  preventSwipeBack = false,
  renderContent = content => content,
  renderHeader,
  runtimeAdapter,
}: StackScreenProps) {
  const activity = useNullableActivity();
  const { pop: stackPop } = useActions();
  const { isTransitioning, pop } = useStackNavigation();
  const { globalTransitionState } = useStack();

  const appScreenRef = useRef<HTMLDivElement>(null!);
  const paperRef = useRef<HTMLDivElement>(null!);
  const edgeRef = useRef<HTMLDivElement>(null!);
  const dimRef = useRef<HTMLDivElement>(null);
  const touchBlockerRef = useRef<HTMLDivElement>(null!);
  // 백 프레스 가드는 렌더를 기다리지 않고 제스처 시작 즉시 막아야 한다
  const isSwipingRef = useRef(false);
  const swipeLockToken = useRef<number | null>(null);

  const isRoot = activity?.isRoot ?? false;
  const transitionState = activity?.transitionState ?? 'enter-done';
  const isTop = activity?.isTop ?? false;

  const [isEntered, setIsEntered] = useState(isRoot);

  useEffect(() => {
    if (!isTop) return;
    runtimeAdapter?.publishStackState?.({ canGoBack: !isRoot });
  }, [isRoot, isTop, runtimeAdapter]);

  const backPressRef = useRef<() => void>(() => {});
  useEffect(() => {
    backPressRef.current = () => {
      if (preventSwipeBack || isRoot || isSwipingRef.current) return;
      pop();
    };
  });

  useEffect(() => {
    if (!isTop) return;
    return runtimeAdapter?.subscribeBackPress?.(() => backPressRef.current());
  }, [isTop, runtimeAdapter]);

  useEffect(() => {
    if (globalTransitionState === 'idle') useNavLockStore.getState().unlock();
  }, [globalTransitionState]);

  usePreventTouchDuringTransition({ ref: appScreenRef });

  useLayoutEffect(() => {
    if (isRoot || isEntered) return;
    // 시작 위치(100%)를 스타일로 확정한 뒤 같은 커밋에서 진입시킨다.
    // 다음 프레임으로 미루면 뒷 페이지 패럴랙스보다 한 프레임 이상 늦게 출발한다.
    void paperRef.current?.offsetWidth;
    setIsEntered(true);
  }, [isRoot, isEntered]);

  // 바로 아래 화면의 패럴랙스는 이 화면의 전이와 같은 커밋에서 건다.
  // react-ui-core useStyleEffectOffset은 pop 때 복귀를 rAF 네 번 뒤로 미뤄, 앞 페이지보다 늦게 출발하며 끊겨 보였다.
  // transition은 ''로 지우지 않고 paper 기본값으로 둔다(지우면 그 화면의 다음 전이가 다른 시간·곡선으로 움직인다).
  // 아래 화면은 매번 다시 찾는다. replace로 아래 화면이 바뀌면 처음 찾은 화면은 이미 사라졌다.
  const isExiting = transitionState.startsWith('exit');
  const backgroundPaperRef = useRef<HTMLElement | null>(null);
  const isExitingRef = useRef(isExiting);
  useLayoutEffect(() => {
    isExitingRef.current = isExiting;
    if (isRoot) return;
    const $back = getBackgroundPaper(appScreenRef.current);
    if (!$back) return;
    backgroundPaperRef.current = $back;
    $back.style.transition = paperTransition;
    $back.style.transform = isExiting ? '' : backgroundOffsetTransform;
  }, [isRoot, isExiting]);
  useLayoutEffect(
    () => () => {
      // exit 상태를 거치지 않고 내려가도 아래 화면이 밀린 채 남지 않게 한다.
      // exit를 거쳤다면 이미 되돌렸고, replace라면 새 화면이 같은 아래 화면을 다시 밀어 둔 상태다.
      if (!isExitingRef.current && backgroundPaperRef.current) backgroundPaperRef.current.style.transform = '';
    },
    []
  );

  // 제스처 첫 프레임에 리렌더가 끼지 않도록 React 상태 없이 DOM과 ref로만 표시한다
  const setSwiping = useCallback((swiping: boolean) => {
    isSwipingRef.current = swiping;
    if (touchBlockerRef.current) touchBlockerRef.current.style.display = swiping ? 'block' : 'none';
  }, []);

  const handleSwipeTransitionEnd = useCallback(
    ({ swiped }: { swiped: boolean }) => {
      if (swiped) {
        const token = swipeLockToken.current;
        swipeLockToken.current = null;

        const lockState = useNavLockStore.getState();
        const ownsLock = token !== null && lockState.token === token;
        if (ownsLock || !lockState.locked) {
          stackPop({ animate: false });
          if (ownsLock) requestAnimationFrame(() => useNavLockStore.getState().unlock(token));
        } else if (paperRef.current) {
          paperRef.current.style.transform = '';
          paperRef.current.style.transition = paperTransition;
        }
        setSwiping(false);
        return;
      }
      setSwiping(false);
    },
    [setSwiping, stackPop]
  );

  useSpringSwipeBack({
    paperRef,
    edgeRef,
    dimRef,
    preventSwipeBack: preventSwipeBack || isRoot,
    onSwipeStart: () => setSwiping(true),
    onSwipeEnd: ({ swiped }) => {
      // 손 뗀 프레임에 락 구독 화면 전체가 리렌더되지 않도록 silent 락을 쓴다(네비게이션 차단은 동일).
      if (swiped) swipeLockToken.current = useNavLockStore.getState().lock({ silent: true });
    },
    onTransitionEnd: handleSwipeTransitionEnd,
  });

  const getTransform = () => {
    if (!isEntered) return 'translate3d(100%, 0, 0)';
    if (transitionState === 'exit-active' && isTop) return 'translate3d(100%, 0, 0)';
    return undefined;
  };

  const header = renderHeader?.({ isRoot, isTransitioning, pop });

  return (
    <div
      ref={appScreenRef}
      className={joinClassNames('stackflow-kit-screen', classNames?.root)}
      style={rootStyle}
      data-stackflow-component-name="AppScreen"
      data-stackflow-kit-exiting={isExiting || undefined}
    >
      {!isRoot && (
        <div
          ref={dimRef}
          className={joinClassNames('stackflow-kit-screen__dim', classNames?.dim)}
          style={{
            ...dimStyle,
            opacity: isEntered && !(transitionState === 'exit-active' && isTop) ? 1 : 0,
          }}
        />
      )}

      <div
        ref={touchBlockerRef}
        className={joinClassNames('stackflow-kit-screen__touch-blocker', classNames?.touchBlocker)}
        style={touchBlockerStyle}
      />

      <div
        ref={paperRef}
        className={joinClassNames('stackflow-kit-screen__paper', classNames?.paper)}
        style={{
          ...paperStyle,
          backgroundColor,
          transform: getTransform(),
        }}
      >
        {header}
        <div
          className={joinClassNames('stackflow-kit-screen__content', classNames?.content)}
          style={{ ...contentStyle, ...injectedContentStyle }}
        >
          {renderContent(children)}
        </div>
      </div>

      {!isRoot && !preventSwipeBack && (
        <div ref={edgeRef} className={joinClassNames('stackflow-kit-screen__edge', classNames?.edge)} style={edgeStyle} />
      )}
    </div>
  );
}

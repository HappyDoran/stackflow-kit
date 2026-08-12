'use client';

import { useActions, useStack } from '@stackflow/react';
import { useNullableActivity, usePreventTouchDuringTransition, useStyleEffectOffset } from '@stackflow/react-ui-core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PARALLAX_OFFSET_PX, STACK_TRANSITION_DURATION_MS } from '../constants/stack-transition.constant.js';
import { useSpringSwipeBack } from '../hooks/use-spring-swipe-back.js';
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
  backgroundColor: 'rgb(0 0 0 / 0.5)',
  inset: 0,
  position: 'absolute',
  transitionProperty: 'opacity',
  transitionTimingFunction: 'ease-out',
  zIndex: 0,
};

const touchBlockerStyle: CSSProperties = {
  backgroundColor: 'transparent',
  inset: 0,
  pointerEvents: 'auto',
  position: 'absolute',
  touchAction: 'none',
  zIndex: 2147483647,
};

const paperStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  inset: 0,
  position: 'absolute',
  transitionProperty: 'transform',
  transitionTimingFunction: 'ease-out',
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
  const swipeLockToken = useRef<number | null>(null);

  const isRoot = activity?.isRoot ?? false;
  const transitionState = activity?.transitionState ?? 'enter-done';
  const isTop = activity?.isTop ?? false;

  const [isEntered, setIsEntered] = useState(isRoot);
  const [isSwiping, setIsSwiping] = useState(false);

  useEffect(() => {
    if (!isTop) return;
    runtimeAdapter?.publishStackState?.({ canGoBack: !isRoot });
  }, [isRoot, isTop, runtimeAdapter]);

  const backPressRef = useRef<() => void>(() => {});
  useEffect(() => {
    backPressRef.current = () => {
      if (preventSwipeBack || isRoot || isSwiping) return;
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
    if (!isRoot && !isEntered) {
      const animationFrame = requestAnimationFrame(() => setIsEntered(true));
      return () => cancelAnimationFrame(animationFrame);
    }
  }, [isRoot, isEntered]);

  useStyleEffectOffset({
    refs: isSwiping ? [] : [paperRef],
    offsetStyles: {
      transform: `translate3d(-${PARALLAX_OFFSET_PX}px, 0, 0)`,
      opacity: '1',
    },
    transitionDuration: `${STACK_TRANSITION_DURATION_MS}ms`,
    hasEffect: true,
  });

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
          paperRef.current.style.transition = '';
        }
        setIsSwiping(false);
        return;
      }
      setIsSwiping(false);
    },
    [stackPop]
  );

  useSpringSwipeBack({
    paperRef,
    edgeRef,
    preventSwipeBack: preventSwipeBack || isRoot,
    onSwipeStart: () => setIsSwiping(true),
    onSwipeEnd: ({ swiped }) => {
      if (swiped) swipeLockToken.current = useNavLockStore.getState().lock();
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
    >
      {!isRoot && (
        <div
          className={joinClassNames('stackflow-kit-screen__dim', classNames?.dim)}
          style={{
            ...dimStyle,
            opacity: isEntered && !(transitionState === 'exit-active' && isTop) ? 1 : 0,
            transitionDuration: `${STACK_TRANSITION_DURATION_MS}ms`,
          }}
        />
      )}

      {isSwiping && (
        <div className={joinClassNames('stackflow-kit-screen__touch-blocker', classNames?.touchBlocker)} style={touchBlockerStyle} />
      )}

      <div
        ref={paperRef}
        className={joinClassNames('stackflow-kit-screen__paper', classNames?.paper)}
        style={{
          ...paperStyle,
          backgroundColor,
          transform: getTransform(),
          transitionDuration: `${STACK_TRANSITION_DURATION_MS}ms`,
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

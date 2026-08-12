export {
  PARALLAX_OFFSET_PX,
  STACK_TRANSITION_DURATION_MS,
} from './constants/stack-transition.constant.js';
export {
  StackScreen,
  type StackScreenClassNames,
  type StackScreenProps,
  type StackScreenRenderContext,
} from './components/stack-screen.js';
export { useSpringSwipeBack } from './hooks/use-spring-swipe-back.js';
export {
  type ActivityName,
  type ActivityParams,
  type NavigationOptions,
  type StackNavigation,
  useStackNavigation,
} from './hooks/use-stack-navigation.js';
export {
  browserStackflowRuntimeAdapter,
  type StackflowRuntimeAdapter,
  type StackState,
} from './runtime/stackflow-runtime-adapter.js';

/**
 * 소비 애플리케이션이 module augmentation으로 채우는 Activity 이름 레지스트리입니다.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 소비자 선언 병합용 public contract
export interface StackActivityRegistry {}

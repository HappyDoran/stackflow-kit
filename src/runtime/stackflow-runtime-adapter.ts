export type StackState = {
  canGoBack: boolean;
};

export type StackflowRuntimeAdapter = {
  publishStackState?: (state: StackState) => void;
  subscribeBackPress?: (handler: () => void) => () => void;
};

/**
 * 브리지 없는 일반 브라우저의 기본 runtime입니다.
 * optional adapter 호출부가 환경 분기 없이 동작하도록 no-op 계약을 제공합니다.
 */
export const browserStackflowRuntimeAdapter: StackflowRuntimeAdapter = {
  publishStackState: () => {},
  subscribeBackPress: () => () => {},
};

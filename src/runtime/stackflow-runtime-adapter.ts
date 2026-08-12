export type StackState = {
  canGoBack: boolean;
};

/**
 * 브리지가 있는 런타임(WebView 등)이 주입하는 계약입니다.
 * 주입하지 않으면 일반 브라우저처럼 동작합니다.
 */
export type StackflowRuntimeAdapter = {
  publishStackState?: (state: StackState) => void;
  subscribeBackPress?: (handler: () => void) => () => void;
};

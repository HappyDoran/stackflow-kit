import { create } from 'zustand';
import { STACK_TRANSITION_DURATION_MS } from '../constants/stack-transition.constant.js';

/**
 * 네비게이션이 idle로 복귀하지 못하는 예외 상황에서
 * 영구 잠금(교착)을 방지하기 위한 안전 해제 시간 (ms)
 *
 * 전이 시간(STACK_TRANSITION_DURATION_MS)에서 파생시켜, 전이 시간을 늘려도
 * fallback이 전이 도중 락을 풀어버리지 않도록 항상 충분한 여유를 유지합니다.
 * (스와이프 스프링 애니메이션 등 idle 상태에서의 시각 연출보다도 길어야 합니다.)
 */
export const FALLBACK_UNLOCK_MS = STACK_TRANSITION_DURATION_MS + 650;

type NavLockState = {
  /** 네비게이션 진행 중 여부 (렌더 사이클과 무관한 동기 값) */
  locked: boolean;
  /** 현재 락을 소유한 토큰 (미잠금 시 0) */
  token: number;
  /**
   * 네비게이션 시작 시 동기적으로 잠급니다.
   * 반환된 토큰을 이용해, 해당 동작이 건 락만 안전하게 해제할 수 있습니다.
   */
  lock: () => number;
  /**
   * 잠금을 해제합니다.
   * - token을 넘기면 현재 소유 토큰과 일치할 때만 해제합니다.
   *   (지연 해제가 이후에 걸린 다른 락을 실수로 푸는 것을 방지)
   * - token을 생략하면 강제로 해제합니다. (전이 완료 등 확정적 해제 신호용)
   */
  unlock: (token?: number) => void;
};

let tokenCounter = 0;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

const clearFallbackTimer = () => {
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
};

/**
 * 전역 네비게이션 락 스토어
 *
 * 버튼 pop/push와 스와이프 백이 하나의 동기 락을 공유하도록 하여
 * - 렌더 사이클 지연으로 인한 연타(중복 네비게이션)를 차단하고
 * - 스와이프 커밋 시점부터 실제 pop 반영까지의 무방비 구간을 덮습니다.
 *
 * `getState().locked`를 클릭/제스처 핸들러 실행 순간에 동기적으로 읽고 설정하므로
 * React 리렌더를 기다리지 않아 같은 프레임 내 연타도 첫 번째 액션만 통과합니다.
 */
export const useNavLockStore = create<NavLockState>((set, get) => ({
  locked: false,
  token: 0,
  lock: () => {
    const token = ++tokenCounter;
    clearFallbackTimer();
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      // 여전히 같은 토큰이 소유 중일 때만 안전 해제합니다.
      if (get().token === token) set({ locked: false, token: 0 });
    }, FALLBACK_UNLOCK_MS);
    set({ locked: true, token });
    return token;
  },
  unlock: (token?: number) => {
    const state = get();
    if (!state.locked) return;
    // 토큰이 지정됐는데 소유 토큰과 다르면, 이미 다른 동작이 락을 넘겨받은 것이므로 무시합니다.
    if (token !== undefined && token !== state.token) return;
    clearFallbackTimer();
    set({ locked: false, token: 0 });
  },
}));

/**
 * stackflow 전이 애니메이션 기준 시간 (ms)
 *
 * stackflow 설정(transitionDuration)과 네비게이션 락 fallback이 같은 값을 공유하도록
 * 단일 출처로 관리합니다. 이 값을 늘리면 락 fallback도 자동으로 함께 늘어납니다.
 */
export const STACK_TRANSITION_DURATION_MS = 350;

/**
 * 뒷 페이지 패럴랙스 오프셋 (px)
 *
 * 스와이프 물리 엔진과 useStyleEffectOffset(평상시 뒷 페이지 위치)이
 * 같은 값을 공유하도록 단일 출처로 관리합니다.
 */
export const PARALLAX_OFFSET_PX = 80;

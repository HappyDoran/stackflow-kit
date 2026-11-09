/**
 * stackflow 전이 애니메이션 기준 시간 (ms)
 *
 * stackflow 설정(transitionDuration)과 네비게이션 락 fallback이 같은 값을 공유하도록
 * 단일 출처로 관리합니다. 이 값을 늘리면 락 fallback도 자동으로 함께 늘어납니다.
 */
export const STACK_TRANSITION_DURATION_MS = 350;

/**
 * 스와이프 백·push·pop이 공유하는 질량 1의 스프링 (임계 감쇠: DAMPING = 2√STIFFNESS)
 *
 * 스와이프는 손을 뗀 속도에서, push·pop은 정지 상태에서 같은 스프링으로 움직여
 * 두 동작의 감속 모양과 마무리 시간이 같아집니다.
 * 고유 진동수 24rad/s에서 정지 출발 시 350ms 시점 잔여 거리는 화면 너비의 0.2%입니다.
 */
export const SPRING_STIFFNESS = 576;
export const SPRING_DAMPING = 48;

/**
 * 정지 상태에서 출발한 스프링을 STACK_TRANSITION_DURATION_MS 안에서 0→1로 정규화한 CSS linear() 곡선
 *
 * styles.css가 이 값을 그대로 담습니다(테스트가 둘의 일치를 확인합니다).
 */
export function springLinearEasing(): string {
  const samples = 24;
  const omega = Math.sqrt(SPRING_STIFFNESS);
  const duration = STACK_TRANSITION_DURATION_MS / 1000;
  // 임계 감쇠 스프링의 정지 출발 해: x(t) = 1 - (1 + ωt)e^(-ωt)
  const progress = (t: number) => 1 - (1 + omega * t) * Math.exp(-omega * t);
  const end = progress(duration);
  const points = Array.from({ length: samples + 1 }, (_, i) =>
    Number((progress((duration * i) / samples) / end).toFixed(4))
  );
  return `linear(${points.join(', ')})`;
}

/**
 * stackflow 전이 애니메이션 곡선
 *
 * linear()를 지원하는 브라우저는 styles.css의 스프링 곡선을, 그렇지 않은 브라우저(iOS 17.2 미만 등)와
 * styles.css를 불러오지 않은 소비자는 같은 스프링에 맞춘 cubic-bezier 근사(최대 오차 약 3%)를 씁니다.
 * 앞 페이지·뒷 페이지 패럴랙스·dim이 같은 곡선으로 움직이도록 함께 씁니다.
 */
export const STACK_TRANSITION_EASING = 'var(--stackflow-kit-easing, cubic-bezier(0.25, 0.4, 0.1, 1))';

/**
 * 뒷 페이지 패럴랙스 오프셋 (화면 너비 대비 비율)
 *
 * 스와이프 물리 엔진과 useStyleEffectOffset(평상시 뒷 페이지 위치)이
 * 같은 값을 공유하도록 단일 출처로 관리합니다. iOS처럼 화면 너비에 비례해 밀립니다.
 */
export const PARALLAX_OFFSET_RATIO = 0.3;

import { useEffect, useRef, type RefObject } from 'react';
import { PARALLAX_OFFSET_PX } from '../constants/stack-transition.constant.js';
import { useNavLockStore } from '../stores/nav-lock.state.js';

/**
 * 스프링 물리 엔진 상수
 */
const SPRING_STIFFNESS = 400; // 스프링 강성 계수 (Hooke's Law: F = -kx)
const DAMPING_COEFFICIENT = 40; // 감쇠 계수 (F = -cv)
const MASS = 1; // 질량
const DT = 1000 / 60; // 시뮬레이션 시간 간격 (60fps 기준, 고정 시간 스텝용)

/**
 * 스와이프 제스처 판단 임계값
 */
const VELOCITY_THRESHOLD = 200; // 플릭으로 인정할 최소 속도 (px/s)
const MIN_FLICK_DISPLACEMENT = 5; // 플릭으로 인정할 최소 이동 거리 (px)
const DRAG_THRESHOLD_RATIO = 0.35; // 드래그로 인정할 최소 비율 (화면 너비 대비)
const STALE_VELOCITY_MS = 80; // 마지막 이동 후 이 시간이 지나 릴리즈하면 플릭으로 보지 않음

/**
 * 스와이프 취소 시 뒷 페이지 복구 애니메이션 시간 (ms)
 */
const BG_RESTORE_MS = 300;

type UseSpringSwipeBackArgs = {
  paperRef: RefObject<HTMLDivElement>;
  edgeRef: RefObject<HTMLDivElement>;
  preventSwipeBack: boolean;
  onSwipeStart?: () => void;
  onSwipeEnd?: (args: { swiped: boolean }) => void;
  onTransitionEnd?: (args: { swiped: boolean }) => void;
};

type SwipeCallbacks = Pick<UseSpringSwipeBackArgs, 'onSwipeStart' | 'onSwipeEnd' | 'onTransitionEnd'>;

/**
 * 스프링 물리 엔진 기반 스와이프 백 훅
 *
 * 네비게이션 락과의 관계 (스와이프 = 버튼 pop 요구사항의 핵심):
 * - 제스처 시작 시 락이 잡혀 있으면 제스처 자체를 시작하지 않습니다.
 * - 커밋 판정 시에도 락을 재확인하여, 제스처 도중 다른 네비게이션이
 *   시작됐다면 커밋 대신 원위치로 복귀합니다.
 *
 * @param paperRef - 메인 콘텐츠 영역의 ref
 * @param edgeRef - 스와이프 제스처 감지 영역의 ref (왼쪽 가장자리)
 * @param preventSwipeBack - 스와이프 백 비활성화 여부
 * @param onSwipeStart - 스와이프 시작 시 호출되는 콜백
 * @param onSwipeEnd - 스와이프 종료 시 호출되는 콜백
 * @param onTransitionEnd - 애니메이션 완료 시 호출되는 콜백
 */
export function useSpringSwipeBack({
  paperRef,
  edgeRef,
  preventSwipeBack,
  onSwipeStart,
  onSwipeEnd,
  onTransitionEnd,
}: UseSpringSwipeBackArgs) {
  /**
   * 콜백 함수들을 ref로 관리하여 최신 값을 유지하면서도
   * 의존성 배열 문제를 방지합니다.
   */
  const callbacksRef = useRef<SwipeCallbacks>({
    onSwipeStart,
    onSwipeEnd,
    onTransitionEnd,
  });

  useEffect(() => {
    callbacksRef.current = { onSwipeStart, onSwipeEnd, onTransitionEnd };
  }, [onSwipeStart, onSwipeEnd, onTransitionEnd]);

  useEffect(() => {
    const $paper = paperRef.current;
    const $edge = edgeRef.current;

    if (preventSwipeBack || !$paper || !$edge) return;

    // 터치 이벤트 상태
    let activeTouchId: number | null = null; // 제스처를 소유한 터치 (멀티터치 간섭 방지)
    let startX: number | null = null;
    let startY: number | null = null;
    let isHorizontalSwipe: boolean | null = null;
    let lastTouchX: number | null = null;
    let lastTouchTime: number | null = null;

    // 물리 시뮬레이션 상태
    let velocity = 0; // 현재 속도 (px/s)
    let currX = 0; // 현재 위치 (px)
    let prevX = 0; // 이전 프레임 위치 (px, 보간용)
    let targetX = 0; // 목표 위치 (px)
    let isSwiped = false; // 스와이프 완료 여부

    // 애니메이션 상태
    let animationId: number | null = null;
    let cleanupTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastTimeStamp: number | null = null;
    let accumulatedTime = 0; // 누적 시간 (고정 시간 스텝 시뮬레이션용)
    let rafLock = false; // requestAnimationFrame 중복 호출 방지 플래그

    // 스와이프 시작(onSwipeStart 발화)부터 onTransitionEnd 전달까지 true.
    // 훅이 도중에 내려가도 cleanup에서 결과를 반드시 전달하기 위한 플래그.
    let inFlight = false;

    // 제스처 시작 시점에 한 번 조회해 캐싱 (매 프레임 DOM 탐색/레이아웃 읽기 방지)
    let bgPapers: HTMLElement[] = [];
    let paperWidth = 0;

    /**
     * 현재 화면 바로 뒤 화면의 paper 요소를 반환
     * basicRendererPlugin은 스택 순서대로 형제 요소를 렌더링하므로
     * previousElementSibling이 곧 이전 화면입니다.
     */
    const getBackgroundPapers = (): HTMLElement[] => {
      const $appScreen = $paper.closest('[data-stackflow-component-name="AppScreen"]');
      const previousScreen = $appScreen?.previousElementSibling as HTMLElement | null;
      if (previousScreen?.getAttribute('data-stackflow-component-name') !== 'AppScreen') return [];
      const paper = previousScreen.querySelector('.bg-background');
      return paper ? [paper as HTMLElement] : [];
    };

    /** 이 제스처를 소유한 터치를 찾음 */
    const getActiveTouch = (touches: TouchList) => {
      for (let i = 0; i < touches.length; i += 1) {
        if (touches[i].identifier === activeTouchId) return touches[i];
      }
      return null;
    };

    const resetTouchState = () => {
      activeTouchId = null;
      startX = null;
      startY = null;
      lastTouchX = null;
      lastTouchTime = null;
      isHorizontalSwipe = null;
    };

    /**
     * 현재 상태를 화면에 렌더링
     *
     * @param alpha - 프레임 간 보간 계수 (0~1)
     */
    const render = (alpha: number) => {
      // 폭이 0이면(전이 중 detach 등) NaN transform을 만들지 않도록 스킵
      if (!paperWidth) return;

      // 취소 스프링이 0을 지나쳐 음수로 overshoot하지 않도록 클램프
      const renderX = Math.max(0, prevX + (currX - prevX) * alpha);
      const ratio = renderX / paperWidth;

      // Top Card (메인 콘텐츠 영역) 위치 업데이트
      $paper.style.transform = `translate3d(${renderX}px, 0, 0)`;
      $paper.style.transition = 'none';

      // Background Card (뒷 페이지) 패럴랙스 효과 적용
      bgPapers.forEach((bgPaper) => {
        // ratio에 따라 -PARALLAX_OFFSET_PX에서 0 사이로 이동
        const parallaxX = -PARALLAX_OFFSET_PX + PARALLAX_OFFSET_PX * ratio;
        const clampedX = Math.min(0, Math.max(-PARALLAX_OFFSET_PX, parallaxX));
        bgPaper.style.transform = `translate3d(${clampedX}px, 0, 0)`;
        bgPaper.style.transition = 'none';
      });
    };

    /**
     * 스프링 물리 시뮬레이션 한 스텝 업데이트
     * Hooke's Law와 감쇠를 적용하여 자연스러운 애니메이션 생성
     */
    const update = () => {
      prevX = currX;

      // 스프링 힘 계산 (Hooke's Law: F = -kx)
      const displacement = currX - targetX;
      const springForce = -SPRING_STIFFNESS * displacement;

      // 감쇠 힘 계산 (F = -cv)
      const dampingForce = -DAMPING_COEFFICIENT * velocity;

      // 가속도 계산 (F = ma)
      const acceleration = (springForce + dampingForce) / MASS;

      // 속도와 위치 업데이트
      velocity += acceleration * (DT / 1000);
      currX += velocity * (DT / 1000);
    };

    /**
     * 애니메이션 루프
     * 고정 시간 스텝 시뮬레이션을 사용하여 프레임레이트와 무관하게 일관된 물리 시뮬레이션 보장
     */
    const animate = (timeStamp: number) => {
      if (animationId === null) return;

      // 첫 프레임 초기화 (두 번 업데이트하여 초기 속도 생성)
      if (!lastTimeStamp) {
        lastTimeStamp = timeStamp;
        update();
        update();
      }

      // 경과 시간 계산 및 누적
      const timeElapsed = Math.min(timeStamp - lastTimeStamp, 64);
      lastTimeStamp = timeStamp;
      accumulatedTime += timeElapsed;

      // 고정 시간 스텝으로 물리 시뮬레이션 업데이트
      while (accumulatedTime >= DT) {
        update();
        accumulatedTime -= DT;
      }

      // 남은 시간에 대한 보간 계수 계산
      const alpha = accumulatedTime / DT;
      render(alpha);

      // 목표 위치에 도달하고 속도가 충분히 낮으면 애니메이션 종료
      if (Math.abs(targetX - currX) < 1 && Math.abs(velocity) < 10) {
        currX = prevX = targetX;
        render(1);
        finishAnimation();
      } else {
        animationId = requestAnimationFrame(animate);
      }
    };

    /**
     * 애니메이션 완료 처리
     * 스와이프 성공 시 뒷 페이지를 고정하고 콜백 호출, 취소 시 복구 처리 실행
     */
    const finishAnimation = () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }

      if (isSwiped) {
        /**
         * 스와이프 성공 시
         * 뒷 페이지를 0 위치로 고정하고 콜백 호출 (AppScreen에서 pop 수행)
         */
        const papers = bgPapers;
        papers.forEach((bgPaper) => {
          bgPaper.style.transform = 'translate3d(0, 0, 0)';
          // 다음 화면의 pop 애니메이션이 정상 동작하도록 swipe 중 설정한
          // 인라인 transition을 pop 전에 제거합니다.
          bgPaper.style.transition = '';
        });

        inFlight = false;
        Promise.resolve()
          .then(() => callbacksRef.current.onTransitionEnd?.({ swiped: true }))
          .then(
            () =>
              new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                  papers.forEach((bgPaper) => {
                    bgPaper.style.transform = '';
                    bgPaper.style.transition = '';
                  });
                  resolve();
                });
              })
          );
      } else {
        cleanStyles();
      }
    };

    /**
     * 인라인 스타일 정리 및 복구 처리 (스와이프 취소/무효 시)
     *
     * 입력 잠금이 필요 이상으로 유지되지 않도록 onTransitionEnd는 즉시 호출하고,
     * 뒷 페이지 복구 애니메이션의 스타일 정리만 지연 실행합니다.
     */
    const cleanStyles = () => {
      $paper.style.transform = '';
      $paper.style.transition = '';

      const papers = bgPapers;
      if (papers.length > 0) {
        // Back Card 복구: 패럴랙스 위치로 복구 애니메이션 실행
        papers.forEach((bgPaper) => {
          bgPaper.style.transition = `transform ${BG_RESTORE_MS}ms ease-out`;
          bgPaper.style.transform = `translate3d(-${PARALLAX_OFFSET_PX}px, 0, 0)`;
        });

        if (cleanupTimeoutId) clearTimeout(cleanupTimeoutId);
        cleanupTimeoutId = setTimeout(() => {
          papers.forEach((bgPaper) => {
            bgPaper.style.transform = '';
            bgPaper.style.transition = '';
          });
        }, BG_RESTORE_MS);
      }

      inFlight = false;
      callbacksRef.current.onTransitionEnd?.({ swiped: false });
    };

    /**
     * 터치 시작 이벤트 핸들러
     */
    const onTouchStart = (e: TouchEvent) => {
      // 커밋된 스와이프의 스프링이 진행 중이면 새 터치가 pop을 취소시키지 않도록 무시
      if (animationId !== null && isSwiped) return;

      // 이미 제스처가 진행 중이면 추가 손가락 무시
      if (activeTouchId !== null) return;

      // 다른 네비게이션(버튼 pop/push 등)이 락을 잡고 있으면 제스처를 시작하지 않음
      // — 버튼 pop과 동일한 가드
      if (useNavLockStore.getState().locked) return;

      // 진행 중인 취소 스프링은 새 제스처가 이어받음
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }

      // 이전 취소 스와이프의 뒷 페이지 복구 타이머가 새 제스처의 transform을 지우지 않도록 해제
      if (cleanupTimeoutId) {
        clearTimeout(cleanupTimeoutId);
        cleanupTimeoutId = null;
      }

      const touch = e.changedTouches[0];
      activeTouchId = touch.identifier;
      startX = touch.clientX;
      startY = touch.clientY;
      lastTouchX = startX;
      lastTouchTime = Date.now();

      // 물리 시뮬레이션 상태 초기화
      velocity = 0;
      currX = 0;
      prevX = 0;
      isSwiped = false;
      isHorizontalSwipe = null;

      bgPapers = getBackgroundPapers();
      paperWidth = $paper.clientWidth;
    };

    /**
     * 터치 이동 이벤트 핸들러
     * 수평 스와이프 감지, 속도 계산, 화면 업데이트
     */
    const onTouchMove = (e: TouchEvent) => {
      const touch = getActiveTouch(e.touches);
      if (!touch || startX === null || startY === null || lastTouchX === null || lastTouchTime === null) return;

      const currTime = Date.now();
      const touchX = touch.clientX;
      const touchY = touch.clientY;
      const dx = touchX - startX;
      const dy = touchY - startY;

      // 수평/수직 스와이프 방향 판단 (5px 이상 이동 시 결정)
      if (isHorizontalSwipe === null) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
          isHorizontalSwipe = true;
          inFlight = true;
          callbacksRef.current.onSwipeStart?.();
        } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
          isHorizontalSwipe = false;
        }
      }

      if (isHorizontalSwipe !== true) return;

      // 속도 계산 (지수 이동 평균) — 왼쪽 이동 중에도 갱신해 stale velocity 방지
      const dt = (currTime - lastTouchTime) / 1000;
      if (dt > 0) {
        velocity = velocity * 0.1 + ((touchX - lastTouchX) / dt) * 0.9;
      }
      lastTouchX = touchX;
      lastTouchTime = currTime;

      // 시작점 왼쪽으로는 끌리지 않도록 클램프
      const clampedDx = Math.max(0, dx);
      currX = clampedDx;
      prevX = clampedDx;

      // requestAnimationFrame을 통한 부드러운 렌더링 (중복 호출 방지)
      if (!rafLock) {
        rafLock = true;
        requestAnimationFrame(() => {
          render(1);
          rafLock = false;
        });
      }

    };

    /**
     * 터치 종료 이벤트 핸들러
     * 속도와 드래그 거리를 기반으로 스와이프 성공 여부 판단 후 스프링 애니메이션 시작
     */
    const onTouchEnd = (e: TouchEvent) => {
      const touch = getActiveTouch(e.changedTouches);
      if (!touch) return; // 다른 손가락의 종료는 무시

      // 수평 스와이프로 판정된 적 없으면 정리만 하고 종료
      // (취소 스프링을 이어받은 탭이었다면 cleanStyles로 원위치 복구)
      if (isHorizontalSwipe !== true || startX === null || lastTouchX === null) {
        resetTouchState();
        if (inFlight) cleanStyles();
        return;
      }

      // 멈춘 채로 릴리즈했다면 마지막 이동 속도는 무효 (native 플릭 의미론)
      if (lastTouchTime !== null && Date.now() - lastTouchTime > STALE_VELOCITY_MS) {
        velocity = 0;
      }

      // 플릭 판단: 속도가 임계값을 넘고 최소 이동 거리를 넘으면 플릭으로 인정
      const displacement = lastTouchX - startX;
      const ratio = paperWidth > 0 ? displacement / paperWidth : 0;
      const isFlick = velocity > VELOCITY_THRESHOLD && displacement > MIN_FLICK_DISPLACEMENT;

      // 드래그 판단: 화면 너비의 일정 비율 이상 드래그하면 성공으로 인정
      const isDrag = ratio > DRAG_THRESHOLD_RATIO;

      // 커밋 직전에 락 재확인: 제스처 도중 다른 네비게이션이 시작됐다면 커밋하지 않음
      isSwiped = (isFlick || isDrag) && !useNavLockStore.getState().locked;

      callbacksRef.current.onSwipeEnd?.({ swiped: isSwiped });
      resetTouchState();

      // 이동량이 없는 무효 제스처는 스프링 없이 즉시 정리 (입력 잠금 최소화)
      if (!isSwiped && displacement <= 0) {
        cleanStyles();
        return;
      }

      targetX = isSwiped ? paperWidth : 0; // 성공 시 화면 밖으로, 실패 시 원위치

      // 스프링 애니메이션 시작
      lastTimeStamp = null;
      accumulatedTime = 0;
      animationId = requestAnimationFrame(animate);
    };

    /**
     * 터치 취소 이벤트 핸들러 (전화 수신, OS 제스처 등 시스템 인터럽트)
     * 네이티브 의미론에 따라 커밋하지 않고 항상 원위치로 복귀합니다.
     */
    const onTouchCancel = (e: TouchEvent) => {
      const touch = getActiveTouch(e.changedTouches);
      if (!touch) return;

      const wasActive = isHorizontalSwipe === true;
      resetTouchState();

      if (!wasActive) {
        if (inFlight) cleanStyles();
        return;
      }

      callbacksRef.current.onSwipeEnd?.({ swiped: false });

      velocity = 0;
      isSwiped = false;
      targetX = 0;
      lastTimeStamp = null;
      accumulatedTime = 0;
      animationId = requestAnimationFrame(animate);
    };

    // 터치 이벤트 리스너 등록 (passive: true로 스크롤 성능 최적화)
    $edge.addEventListener('touchstart', onTouchStart, { passive: true });
    $edge.addEventListener('touchmove', onTouchMove, { passive: true });
    $edge.addEventListener('touchend', onTouchEnd, { passive: true });
    $edge.addEventListener('touchcancel', onTouchCancel, { passive: true });

    // 클린업 함수
    return () => {
      $edge.removeEventListener('touchstart', onTouchStart);
      $edge.removeEventListener('touchmove', onTouchMove);
      $edge.removeEventListener('touchend', onTouchEnd);
      $edge.removeEventListener('touchcancel', onTouchCancel);

      if (animationId !== null) cancelAnimationFrame(animationId);
      if (cleanupTimeoutId) clearTimeout(cleanupTimeoutId);

      /**
       * 스와이프/스프링 도중 훅이 내려가는 경우:
       * 인라인 스타일을 정리하고 보류 중인 결과를 반드시 전달합니다.
       * (커밋된 스와이프의 pop 유실·터치 차단 오버레이 잔존 방지.
       *  pop 실행 여부는 StackScreen이 락 토큰 소유를 확인해 결정합니다.)
       */
      if (inFlight) {
        $paper.style.transform = '';
        $paper.style.transition = '';
        bgPapers.forEach((bgPaper) => {
          bgPaper.style.transform = '';
          bgPaper.style.transition = '';
        });
        callbacksRef.current.onTransitionEnd?.({ swiped: isSwiped });
      }
    };
  }, [preventSwipeBack, paperRef, edgeRef]);
}

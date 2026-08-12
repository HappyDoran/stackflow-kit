import { FALLBACK_UNLOCK_MS, navigationLock } from '@happydoran/stackflow-kit/navigation-lock';

describe('navigationLock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    navigationLock.release();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lock은 locked를 true로 만들고 고유 토큰을 반환한다', () => {
    const first = navigationLock.acquire();
    expect(navigationLock.isLocked()).toBe(true);
    navigationLock.release();

    const second = navigationLock.acquire();
    expect(second).not.toBe(first);
  });

  it('소유 토큰이 아닌 unlock은 무시된다', () => {
    const owner = navigationLock.acquire();
    navigationLock.release(owner + 999);
    expect(navigationLock.isLocked()).toBe(true);
  });

  it('소유 토큰으로 unlock하면 해제된다', () => {
    const owner = navigationLock.acquire();
    navigationLock.release(owner);
    expect(navigationLock.isLocked()).toBe(false);
  });

  it('토큰 없는 unlock은 강제로 해제한다', () => {
    navigationLock.acquire();
    navigationLock.release();
    expect(navigationLock.isLocked()).toBe(false);
  });

  it('새 lock이 기존 락을 대체하면 이전 토큰의 지연 해제는 무시된다', () => {
    const oldToken = navigationLock.acquire();
    navigationLock.acquire();

    navigationLock.release(oldToken);
    expect(navigationLock.isLocked()).toBe(true);
  });

  it('fallback 타이머가 교착 상태를 해제한다', () => {
    navigationLock.acquire();
    jest.advanceTimersByTime(FALLBACK_UNLOCK_MS);
    expect(navigationLock.isLocked()).toBe(false);
  });

  it('재잠금 시 이전 fallback 타이머는 새 락을 풀지 않는다', () => {
    navigationLock.acquire();
    jest.advanceTimersByTime(FALLBACK_UNLOCK_MS - 10);
    navigationLock.acquire();

    jest.advanceTimersByTime(10);
    expect(navigationLock.isLocked()).toBe(true);

    jest.advanceTimersByTime(FALLBACK_UNLOCK_MS);
    expect(navigationLock.isLocked()).toBe(false);
  });
});

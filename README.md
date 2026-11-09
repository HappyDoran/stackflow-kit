# @happydoran/stackflow-kit

React 애플리케이션에서 StackFlow 네비게이션을 안전하게 조립하기 위한 runtime-agnostic 패키지입니다. 같은 프레임의 중복 action을 막는 navigation lock, 타입이 지정된 `push`/`replace`, 스프링 swipe-back, 화면 lifecycle과 runtime adapter 계약을 제공합니다.

현재 `0.x` 단계이며 npm 최초 공개 배포 전입니다. 공개 API의 호환성 정책은 아래 “버전 정책”을 따릅니다.

## 설치

```bash
npm install @happydoran/stackflow-kit @stackflow/react @stackflow/react-ui-core react
```

지원 peer dependency 범위는 다음과 같습니다.

| 패키지                     | 지원 범위          |
| -------------------------- | ------------------ |
| `react`                    | `>=19.0.0 <20.0.0` |
| `@stackflow/react`         | `^1.12.0`          |
| `@stackflow/react-ui-core` | `^1.3.3`           |

화면 기본 스타일은 애플리케이션 진입점에서 한 번 가져옵니다.

```ts
import '@happydoran/stackflow-kit/styles.css';
```

### 전환 동작

push·pop과 swipe-back은 같은 임계 감쇠 스프링으로 움직입니다. swipe-back은 손을 뗀 속도에서, push·pop은 정지 상태에서 출발합니다.

- push·pop 곡선은 `styles.css`의 CSS `linear()` 값(`--stackflow-kit-easing`)입니다. `linear()`를 지원하지 않는 브라우저(iOS 17.2 미만 등)나 `styles.css`를 가져오지 않은 경우에는 같은 스프링에 맞춘 `cubic-bezier` 근사를 씁니다.
- 아래 화면은 너비의 `PARALLAX_OFFSET_RATIO`(30%)만큼 밀리고, 위 화면의 dim이 10% 어둡게 덮습니다. 아래 화면 위치는 `StackScreen`이 위 화면의 전이와 같은 커밋에서 바꿉니다.
- 전환 시간은 `STACK_TRANSITION_DURATION_MS`이고, `stackflow()`의 `transitionDuration`에도 같은 값을 넘깁니다.

## Activity 타입과 안전한 네비게이션

패키지는 별도 provider를 추가하지 않습니다. 소비 애플리케이션이 기존 StackFlow `stackflow()` 설정을 소유하고, module augmentation으로 Activity별 params를 등록합니다.

```tsx
'use client';

import { stackflow } from '@stackflow/react';
import { STACK_TRANSITION_DURATION_MS, useStackNavigation } from '@happydoran/stackflow-kit';

declare module '@happydoran/stackflow-kit' {
  interface StackActivityRegistry {
    HomeActivity: Record<string, never>;
    DetailActivity: { itemId: string };
  }
}

const activities = {
  HomeActivity,
  DetailActivity,
};

export const { Stack } = stackflow({
  activities,
  transitionDuration: STACK_TRANSITION_DURATION_MS,
});

function OpenDetailButton() {
  const navigation = useStackNavigation();

  return (
    <button
      disabled={navigation.isTransitioning}
      onClick={() => navigation.push('DetailActivity', { itemId: 'item-1' })}
    >
      상세 보기
    </button>
  );
}
```

`push`, `replace`, `replaceTab`, `pop`은 공통 lock을 경유합니다. 화면 코드에서 `@stackflow/react`의 `useActions()`를 직접 호출하면 이 보호를 우회하므로, 사용자 action에는 `useStackNavigation()`을 사용합니다.

## StackScreen 조립

`StackScreen`은 AppBar나 디자인 시스템을 포함하지 않습니다. `renderHeader`, `renderContent`, `classNames`로 애플리케이션 UI를 주입합니다.

```tsx
import { StackScreen } from '@happydoran/stackflow-kit';

export function DetailActivity() {
  return (
    <StackScreen
      renderHeader={({ isRoot, isTransitioning, pop }) => (
        <header>
          {!isRoot && (
            <button disabled={isTransitioning} onClick={pop}>
              뒤로
            </button>
          )}
        </header>
      )}
      renderContent={(children) => <main>{children}</main>}
    >
      상세 콘텐츠
    </StackScreen>
  );
}
```

## Runtime adapter

`runtimeAdapter`를 주입하지 않으면 일반 브라우저처럼 동작합니다. WebView나 다른 host runtime에서는 back event와 현재 stack 상태를 연결하는 adapter를 주입합니다.

```tsx
import { StackScreen, type StackflowRuntimeAdapter } from '@happydoran/stackflow-kit';

const runtimeAdapter: StackflowRuntimeAdapter = {
  publishStackState: ({ canGoBack }) => hostBridge.send({ canGoBack }),
  subscribeBackPress: (handler) => hostBridge.subscribe('back', handler),
};

export function HostedActivity() {
  return <StackScreen runtimeAdapter={runtimeAdapter}>콘텐츠</StackScreen>;
}
```

`subscribeBackPress`는 구독 해제 함수를 반환해야 합니다.

## 저수준 navigation lock

React hook 밖에서 동일 lock을 연동해야 할 때만 별도 export를 사용합니다.

```ts
import { navigationLock } from '@happydoran/stackflow-kit/navigation-lock';

const token = navigationLock.acquire();
try {
  // navigation과 경합하면 안 되는 동기 작업
} finally {
  navigationLock.release(token);
}
```

## 버전 정책

- SemVer를 사용합니다.
- `0.x` 동안 호환되지 않는 공개 API 변경은 minor 버전을 올리고, 호환되는 수정은 patch 버전을 올립니다.
- 각 릴리스 변경 내역은 `stackflow-kit-vX.Y.Z` GitHub Release가 소유합니다. 별도 `CHANGELOG.md`를 중복 유지하지 않습니다.
- 안정화 이후 `1.0.0`에서 공개 API 호환성 보장을 시작합니다.

## 개발 검증

navigation lock, guarded action, swipe, screen lifecycle의 동작은 `tests/`가 소유합니다.

```bash
npm run typecheck
npm test                 # 동작 테스트 (jsdom)
npm run verify:package   # tarball을 Next.js와 Vite fixture에 설치해 배포 산출물 검증
```

MIT License로 배포합니다. 공개 source repository와 npm scope 권한이 준비되기 전에는 패키지를 배포하지 않습니다.

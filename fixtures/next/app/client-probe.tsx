'use client';

import { StackScreen, browserStackflowRuntimeAdapter, type StackNavigation } from '@happydoran/stackflow-kit';

declare module '@happydoran/stackflow-kit' {
  interface StackActivityRegistry {
    FixtureActivity: { id: string };
  }
}

function verifyNavigationTypes(navigation: StackNavigation) {
  navigation.push('FixtureActivity', { id: 'fixture' });
  // @ts-expect-error FixtureActivity에는 id가 필요하다.
  navigation.push('FixtureActivity', {});
}

void verifyNavigationTypes;

export function ClientProbe() {
  return <p data-adapter={typeof browserStackflowRuntimeAdapter.publishStackState}>{StackScreen.name}</p>;
}

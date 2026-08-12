import { FALLBACK_UNLOCK_MS, useNavLockStore } from './stores/nav-lock.state.js';

export { FALLBACK_UNLOCK_MS };

export type NavigationLockToken = number;

export const navigationLock = {
  acquire: (): NavigationLockToken => useNavLockStore.getState().lock(),
  isLocked: () => useNavLockStore.getState().locked,
  release: (token?: NavigationLockToken) => useNavLockStore.getState().unlock(token),
};

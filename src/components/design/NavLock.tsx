"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface NavLockState {
  locked: boolean;
  /** Bumps each time the last holder lets go: a job just ended. */
  releases: number;
}

// Two contexts: holders only need the stable hold(), so a lock change
// re-renders the nav, not the page that is running the job.
const HoldContext = createContext<(() => () => void) | null>(null);
const StateContext = createContext<NavLockState>({
  locked: false,
  releases: 0,
});

export function NavLockProvider({ children }: { children: ReactNode }) {
  const [{ holders, releases }, setState] = useState({
    holders: 0,
    releases: 0,
  });
  const hold = useCallback(() => {
    setState((s) => ({ ...s, holders: s.holders + 1 }));
    return () =>
      setState((s) => ({
        holders: s.holders - 1,
        releases: s.holders === 1 ? s.releases + 1 : s.releases,
      }));
  }, []);
  const locked = holders > 0;
  const state = useMemo(() => ({ locked, releases }), [locked, releases]);
  return (
    <HoldContext.Provider value={hold}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </HoldContext.Provider>
  );
}

/** Makes every site-nav item inert while `active`: leaving mid-job aborts it. */
export function useNavLock(active: boolean): void {
  const hold = useContext(HoldContext);
  useEffect(() => {
    if (!active || !hold) return;
    return hold();
  }, [active, hold]);
}

export function useNavLockState(): NavLockState {
  return useContext(StateContext);
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type PageLoadingContextValue = {
  pageLoading: boolean;
  setPageLoading: (loading: boolean) => void;
};

const PageLoadingContext = createContext<PageLoadingContextValue | null>(null);

export { PageLoadingContext };

export function PageLoadingProvider({ children }: { children: ReactNode }) {
  const [pageLoading, setPageLoadingState] = useState(false);

  const setPageLoading = useCallback((loading: boolean) => {
    setPageLoadingState(loading);
  }, []);

  const value = useMemo(
    () => ({ pageLoading, setPageLoading }),
    [pageLoading, setPageLoading],
  );

  return (
    <PageLoadingContext.Provider value={value}>{children}</PageLoadingContext.Provider>
  );
}

/** Drives the shell overlay from this page's data-load state. */
export function useShellPageLoading(isLoading: boolean) {
  const ctx = useContext(PageLoadingContext);
  // Depend on the stable setter only — including `ctx` re-subscribes on every
  // pageLoading flip and can thrash setState (overlay flicker / UI freeze).
  const setPageLoading = ctx?.setPageLoading;

  useEffect(() => {
    if (!setPageLoading) return;
    setPageLoading(isLoading);
    return () => setPageLoading(false);
  }, [setPageLoading, isLoading]);
}

export function usePageLoadingState() {
  const ctx = useContext(PageLoadingContext);
  if (!ctx) {
    throw new Error("usePageLoadingState must be used within PageLoadingProvider");
  }
  return ctx;
}

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ConfirmDeleteRequest = {
  title: string;
  description?: string;
  confirmLabel?: string;
};

type ConfirmDeleteContextValue = {
  confirmDelete: (request: ConfirmDeleteRequest) => Promise<boolean>;
};

const ConfirmDeleteContext = createContext<ConfirmDeleteContextValue | null>(null);

type Pending = ConfirmDeleteRequest & {
  resolve: (value: boolean) => void;
};

export function ConfirmDeleteProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const close = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(confirmed);
  }, []);

  const confirmDelete = useCallback((request: ConfirmDeleteRequest) => {
    return new Promise<boolean>((resolve) => {
      const next: Pending = { ...request, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const value = useMemo(() => ({ confirmDelete }), [confirmDelete]);

  return (
    <ConfirmDeleteContext.Provider value={value}>
      {children}
      {pending ? (
        <div
          className="confirm-delete"
          role="presentation"
          onMouseDown={() => close(false)}
        >
          <div
            className="confirm-delete__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            aria-describedby="confirm-delete-desc"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="confirm-delete-title" className="confirm-delete__title">
              {pending.title}
            </h2>
            <p id="confirm-delete-desc" className="confirm-delete__desc">
              {pending.description ?? "This will permanently remove the selected item."}
            </p>

            <div className="confirm-delete__actions">
              <button
                type="button"
                className="confirm-delete__btn confirm-delete__btn--ghost"
                onClick={() => close(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm-delete__btn confirm-delete__btn--danger"
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmDeleteContext.Provider>
  );
}

export function useConfirmDelete() {
  const ctx = useContext(ConfirmDeleteContext);
  if (!ctx) {
    throw new Error("useConfirmDelete must be used within ConfirmDeleteProvider");
  }
  return ctx;
}

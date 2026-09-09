import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type NotifyVariant = "error" | "info" | "success";

type ToastItem = {
  id: string;
  message: string;
  variant: NotifyVariant;
};

type NotifyOptions = {
  variant?: NotifyVariant;
  durationMs?: number;
};

type NotificationContextValue = {
  notify: (message: string, options?: NotifyOptions) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

let toastCounter = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, options?: NotifyOptions) => {
      const id = `toast-${++toastCounter}`;
      const variant = options?.variant ?? "info";
      const durationMs = options?.durationMs ?? (variant === "error" ? 5500 : 4500);

      setToasts((current) => [...current, { id, message, variant }]);
      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <p key={toast.id} className={`toast toast--${toast.variant}`} role="status">
            {toast.message}
          </p>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotify(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotify must be used within NotificationProvider");
  }
  return ctx;
}

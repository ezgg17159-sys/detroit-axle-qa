const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

function apiPath(path: string): string {
  return `${API_URL}${path}`;
}

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_staff?: boolean;
  is_superuser?: boolean;
};

export type LoginResponse = {
  user: AuthUser;
};

const USER_KEY = "daq_user";
const LEGACY_ACCESS_KEY = "daq_access";
const LEGACY_REFRESH_KEY = "daq_refresh";

let csrfTokenCache: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

/** Remove legacy token storage from earlier builds. */
export function purgeLegacyTokenStorage(): void {
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeUser(user: AuthUser): void {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_KEY);
  purgeLegacyTokenStorage();
  csrfTokenCache = null;
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]!) : null;
}

export async function ensureCsrfToken(): Promise<string> {
  const fromCookie = readCookie("csrftoken");
  if (fromCookie) {
    csrfTokenCache = fromCookie;
    return fromCookie;
  }
  if (csrfTokenCache) return csrfTokenCache;

  const response = await fetch(apiPath("/api/auth/csrf/"), {
    method: "GET",
    credentials: "include",
  });
  const data = await response.json().catch(() => ({}));
  const token =
    (typeof data.csrfToken === "string" && data.csrfToken) ||
    readCookie("csrftoken") ||
    "";
  if (!token) {
    throw new Error("Unable to initialize secure session.");
  }
  csrfTokenCache = token;
  return token;
}

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const csrf = await ensureCsrfToken();
      const response = await fetch(apiPath("/api/auth/refresh/"), {
        method: "POST",
        credentials: "include",
        headers: {
          "X-CSRFToken": csrf,
        },
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

type ApiFetchOptions = RequestInit & { skipAuthRetry?: boolean };

export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = await ensureCsrfToken();
    headers.set("X-CSRFToken", csrf);
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  let response: Response;
  try {
    response = await fetch(apiPath(path), {
      ...options,
      method,
      headers,
      credentials: "include",
    });
  } catch {
    throw new Error(
      "Cannot reach the API. Make sure Django is running on port 8000.",
    );
  }

  if (response.status === 401 && !options.skipAuthRetry) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetch(path, { ...options, skipAuthRetry: true });
    }
    clearSession();
    window.dispatchEvent(new Event("daq:auth-expired"));
  }

  return response;
}

export async function loginRequest(
  login: string,
  password: string,
  rememberMe = true,
): Promise<LoginResponse> {
  purgeLegacyTokenStorage();
  await ensureCsrfToken();
  const response = await apiFetch("/api/auth/login/", {
    method: "POST",
    body: JSON.stringify({
      login,
      password,
      remember_me: Boolean(rememberMe),
    }),
    skipAuthRetry: true,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "Unable to sign in. Check your credentials.";
    throw new Error(detail);
  }

  if (!data.user) {
    throw new Error("Unable to sign in. Check your credentials.");
  }
  return { user: data.user as AuthUser };
}

export async function logoutRequest(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout/", {
      method: "POST",
      skipAuthRetry: true,
    });
  } catch {
    /* ignore network errors on logout */
  } finally {
    clearSession();
  }
}

export async function changePasswordRequest(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const response = await apiFetch("/api/auth/change-password/", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "Unable to update password.";
    throw new Error(detail);
  }
}

export async function provisionLoginRequest(params: {
  email: string;
  password: string;
  username?: string;
  fullName?: string;
}): Promise<{ created: boolean; detail: string }> {
  const response = await apiFetch("/api/auth/provision-login/", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      username: params.username ?? "",
      full_name: params.fullName ?? "",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "Unable to update login credentials.";
    throw new Error(detail);
  }

  return {
    created: Boolean(data.created),
    detail: typeof data.detail === "string" ? data.detail : "Login updated.",
  };
}

export async function fetchMe(): Promise<AuthUser> {
  const response = await apiFetch("/api/auth/me/");
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data || typeof data !== "object" || !("id" in data)) {
    throw new Error("Unable to load account.");
  }
  return data as AuthUser;
}

export async function forgotPasswordRequest(email: string): Promise<string> {
  purgeLegacyTokenStorage();
  await ensureCsrfToken();
  const response = await apiFetch("/api/auth/forgot-password/", {
    method: "POST",
    body: JSON.stringify({ email }),
    skipAuthRetry: true,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "Unable to send reset link. Try again shortly.";
    throw new Error(detail);
  }
  return typeof data.detail === "string"
    ? data.detail
    : "If an account exists for that email, a reset link has been sent.";
}

export async function resetPasswordRequest(params: {
  uid: string;
  token: string;
  newPassword: string;
}): Promise<string> {
  purgeLegacyTokenStorage();
  await ensureCsrfToken();
  const response = await apiFetch("/api/auth/reset-password/", {
    method: "POST",
    body: JSON.stringify({
      uid: params.uid,
      token: params.token,
      new_password: params.newPassword,
    }),
    skipAuthRetry: true,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "Unable to reset password. The link may be invalid or expired.";
    throw new Error(detail);
  }
  return typeof data.detail === "string"
    ? data.detail
    : "Password updated. You can sign in now.";
}

/** @deprecated Tokens are HttpOnly cookies — always null for callers that still check. */
export function getStoredAccessToken(): string | null {
  return null;
}

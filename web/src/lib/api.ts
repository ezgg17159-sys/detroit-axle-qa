const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  full_name: string;
};

export type LoginResponse = {
  access: string;
  refresh: string;
  user: AuthUser;
};

const ACCESS_KEY = "daq_access";
const REFRESH_KEY = "daq_refresh";
const USER_KEY = "daq_user";

export function getStoredAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeSession(payload: LoginResponse): void {
  localStorage.setItem(ACCESS_KEY, payload.access);
  localStorage.setItem(REFRESH_KEY, payload.refresh);
  localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function loginRequest(
  login: string,
  password: string,
): Promise<LoginResponse> {
  const response = await fetch(`${API_URL}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "Unable to sign in. Check your credentials.";
    throw new Error(detail);
  }

  return data as LoginResponse;
}

export async function fetchMe(accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/api/auth/me/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Session expired.");
  }

  return (await response.json()) as AuthUser;
}

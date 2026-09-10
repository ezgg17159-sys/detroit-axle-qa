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
  let response: Response;
  try {
    response = await fetch(apiPath("/api/auth/login/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    });
  } catch {
    throw new Error(
      "Cannot reach the API. Make sure Django is running on port 8000.",
    );
  }

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
  let response: Response;
  try {
    response = await fetch(apiPath("/api/auth/me/"), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(
      "Cannot reach the API. Make sure Django is running on port 8000.",
    );
  }

  if (!response.ok) {
    throw new Error("Session expired.");
  }

  return (await response.json()) as AuthUser;
}

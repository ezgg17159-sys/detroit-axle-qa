const STORAGE_KEY = "daq_email_testing_v1";

export type EmailTestingSettings = {
  enabled: boolean;
  email: string;
};

const DEFAULT: EmailTestingSettings = {
  enabled: false,
  email: "",
};

function read(): EmailTestingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<EmailTestingSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      email: String(parsed.email || "").trim(),
    };
  } catch {
    return { ...DEFAULT };
  }
}

function write(next: EmailTestingSettings) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      enabled: Boolean(next.enabled),
      email: next.email.trim(),
    }),
  );
}

export function getEmailTestingSettings(): EmailTestingSettings {
  return read();
}

export function saveEmailTestingSettings(next: EmailTestingSettings): EmailTestingSettings {
  const cleaned: EmailTestingSettings = {
    enabled: Boolean(next.enabled) && Boolean(next.email.trim()),
    email: next.email.trim(),
  };
  write(cleaned);
  return cleaned;
}

export function isValidTestEmail(value: string): boolean {
  const email = value.trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Fields merged into every Power Automate trigger body when testing is on. */
export function emailTestingPayloadFields(): {
  emailTestMode: boolean;
  emailTestTo: string;
} {
  const settings = read();
  if (settings.enabled && isValidTestEmail(settings.email)) {
    return { emailTestMode: true, emailTestTo: settings.email.trim() };
  }
  return { emailTestMode: false, emailTestTo: "" };
}

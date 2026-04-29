import "server-only";

/**
 * Minimal Google Calendar REST client.
 * Scope: calendar.events — we can only create/edit events the app owns.
 */

const CAL_API = "https://www.googleapis.com/calendar/v3";

export type CalEventTime =
  | { dateTime: string; timeZone?: string }
  | { date: string };

export type CalReminder = {
  method: "popup" | "email";
  minutes: number;
};

export type CreateEventInput = {
  summary: string;
  description?: string;
  location?: string;
  start: CalEventTime;
  end: CalEventTime;
  /** RRULEs e.g. ["RRULE:FREQ=WEEKLY;BYDAY=FR"] */
  recurrence?: string[];
  reminders?: { useDefault: boolean; overrides?: CalReminder[] };
  /** Source link the event opens to. Shows in Google Calendar UI. */
  source?: { title: string; url: string };
};

export type CalEvent = CreateEventInput & {
  id: string;
  htmlLink: string;
};

class CalendarError extends Error {
  constructor(message: string, public readonly status: number, public readonly body: string) {
    super(`Calendar API ${status}: ${message}`);
  }
}

async function calJson<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CalendarError(res.statusText, res.status, body);
  }
  return res.json() as Promise<T>;
}

/** Create an event on the user's primary calendar. */
export async function createEvent(
  accessToken: string,
  input: CreateEventInput,
  calendarId = "primary",
): Promise<CalEvent> {
  return calJson<CalEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

/**
 * Build an RFC3339 dateTime string for a specific date + HH:MM in a timezone.
 * Google Calendar accepts ISO without offset when timeZone is provided.
 */
export function localDateTime(
  date: Date,
  hhmm: string,
  timeZone: string,
): { dateTime: string; timeZone: string } {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  const isoDate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  const hh = String(h ?? 0).padStart(2, "0");
  const mm = String(m ?? 0).padStart(2, "0");
  return {
    dateTime: `${isoDate}T${hh}:${mm}:00`,
    timeZone,
  };
}

/** Add `minutes` to an HH:MM string, returning HH:MM (clamped to 23:59). */
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  let total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  if (total < 0) total = 0;
  if (total > 23 * 60 + 59) total = 23 * 60 + 59;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

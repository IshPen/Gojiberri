import * as Calendar from "expo-calendar/legacy";
import { Platform } from "react-native";

export type TimeBlock = { start: number; end: number };

const DAY_MS = 24 * 60 * 60 * 1000;

export async function readBusyBlocks(days = 14): Promise<TimeBlock[] | null> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") return null;

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) return [];

  const from = new Date();
  const to = new Date(from.getTime() + days * DAY_MS);
  const events = await Calendar.getEventsAsync(
    calendars.map((calendar) => calendar.id),
    from,
    to,
  );

  return events
    .filter((event) => !event.allDay && event.availability !== Calendar.Availability.FREE)
    .map((event) => ({
      start: new Date(event.startDate).getTime(),
      end: new Date(event.endDate).getTime(),
    }))
    .filter((block) => block.end > block.start)
    .sort((a, b) => a.start - b.start);
}

export type InvitePlan = {
  title: string;
  window: TimeBlock;
};

export type InvitePlace = {
  name: string;
  area?: string;
  bookingUrl?: string;
};

async function writableCalendarId(): Promise<string | null> {
  if (Platform.OS === "ios") {
    const calendar = await Calendar.getDefaultCalendarAsync();
    return calendar.id;
  }
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((calendar) => calendar.allowsModifications);
  return (writable.find((calendar) => calendar.isPrimary) ?? writable[0])?.id ?? null;
}

export async function createInvite(plan: InvitePlan, place: InvitePlace): Promise<string | null> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") return null;

  const calendarId = await writableCalendarId();
  if (!calendarId) return null;

  const notes = ["Planned with Gojiberri 🍓", place.bookingUrl ? `Book: ${place.bookingUrl}` : null]
    .filter(Boolean)
    .join("\n");

  return Calendar.createEventAsync(calendarId, {
    title: plan.title,
    location: place.area ? `${place.name}, ${place.area}` : place.name,
    startDate: new Date(plan.window.start),
    endDate: new Date(plan.window.end),
    notes,
    url: place.bookingUrl,
  });
}

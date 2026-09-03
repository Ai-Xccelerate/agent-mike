export type CalendarId = "meetings" | "personal" | "agents" | "deadlines";

export interface AixCalendar {
  id: CalendarId;
  label: string;
  color: string;
}

export const CALENDARS: AixCalendar[] = [
  { id: "meetings", label: "Meetings", color: "#F47920" },
  { id: "personal", label: "Personal", color: "#3B82F6" },
  { id: "agents", label: "Agents", color: "#10B981" },
  { id: "deadlines", label: "Deadlines", color: "#F04438" },
];

export function getCalendar(id: CalendarId): AixCalendar {
  return CALENDARS.find((c) => c.id === id) ?? CALENDARS[0];
}

export interface AixEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  calendar: CalendarId;
  location?: string;
  description?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDateTime(d: Date): string {
  return `${fmtDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return fmtDate(date);
}

function at(dayOffset: number, hours?: number, minutes = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  if (hours === undefined) return fmtDate(d);
  d.setHours(hours, minutes, 0, 0);
  return fmtDateTime(d);
}

export function seedEvents(): AixEvent[] {
  return [
    {
      id: "e1",
      title: "Acme Logistics QBR",
      start: at(0, 10),
      end: at(0, 11),
      calendar: "meetings",
      location: "Zoom",
      description: "Quarterly review with Scribe recording enabled.",
    },
    {
      id: "e2",
      title: "Weekly revenue standup",
      start: at(-2, 9),
      end: at(-2, 9, 15),
      calendar: "meetings",
    },
    {
      id: "e3",
      title: "Pipeline review with Jules",
      start: at(1, 9),
      end: at(1, 9, 30),
      calendar: "meetings",
      description: "Outbound sequence performance and reply rates.",
    },
    {
      id: "e4",
      title: "Northwind onboarding kickoff",
      start: at(3, 14),
      end: at(3, 15),
      calendar: "meetings",
      location: "Google Meet",
    },
    {
      id: "e5",
      title: "Investor update call",
      start: at(8, 11),
      end: at(8, 11, 45),
      calendar: "meetings",
      description: "Seed round progress and pipeline metrics.",
    },
    {
      id: "e6",
      title: "Deep work block",
      start: at(2, 6),
      end: at(2, 9),
      calendar: "personal",
      description: "No meetings before noon.",
    },
    {
      id: "e7",
      title: "Gym",
      start: at(1, 6, 30),
      end: at(1, 7, 30),
      calendar: "personal",
    },
    {
      id: "e8",
      title: "Family dinner",
      start: at(5, 18, 30),
      end: at(5, 20),
      calendar: "personal",
      location: "Home",
    },
    {
      id: "e9",
      title: "Nick training window",
      start: at(2, 13),
      end: at(2, 15),
      calendar: "agents",
      description: "Retrain demand gen scoring on Q2 conversions.",
    },
    {
      id: "e10",
      title: "Pepper knowledge base refresh",
      start: at(4),
      allDay: true,
      calendar: "agents",
      description: "Sync product docs and pricing into inbound KB.",
    },
    {
      id: "e11",
      title: "Jules sequence A/B review",
      start: at(7, 10),
      end: at(7, 11),
      calendar: "agents",
    },
    {
      id: "e12",
      title: "Tony integration test run",
      start: at(-3, 15),
      end: at(-3, 16),
      calendar: "agents",
      description: "Staging run against the Railway deployment.",
    },
    {
      id: "e13",
      title: "Meridian renewal due",
      start: at(6),
      allDay: true,
      calendar: "deadlines",
      description: "George flags renewal risk 30 days out.",
    },
    {
      id: "e14",
      title: "Q3 pricing proposal deadline",
      start: at(10),
      allDay: true,
      calendar: "deadlines",
    },
    {
      id: "e15",
      title: "SOC 2 evidence submission",
      start: at(-1),
      allDay: true,
      calendar: "deadlines",
    },
  ];
}

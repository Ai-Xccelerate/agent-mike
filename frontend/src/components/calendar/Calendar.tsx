"use client";
import React, { useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import {
  DateSelectArg,
  DatesSetArg,
  EventApi,
  EventClickArg,
  EventContentArg,
  EventInput,
} from "@fullcalendar/core";
import { useModal } from "@/hooks/useModal";
import Button from "@/components/ui/button/Button";
import { PlusIcon } from "@/icons";
import MiniMonth from "./MiniMonth";
import EventModal, { EventDraft } from "./EventModal";
import {
  AixEvent,
  CALENDARS,
  CalendarId,
  addDays,
  fmtDate,
  fmtDateTime,
  getCalendar,
  seedEvents,
} from "./calendarData";

type CalendarView = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "dayGridMonth", label: "Month" },
  { id: "timeGridWeek", label: "Week" },
  { id: "timeGridDay", label: "Day" },
  { id: "listWeek", label: "List" },
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function emptyDraft(): EventDraft {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    id: null,
    title: "",
    allDay: false,
    start: fmtDateTime(start),
    end: fmtDateTime(end),
    calendar: "meetings",
    location: "",
    description: "",
  };
}

const Chevron: React.FC<{ direction: "left" | "right" }> = ({ direction }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const renderEventContent = (arg: EventContentArg) => {
  const calendarId = arg.event.extendedProps.calendar as CalendarId;
  const cal = getCalendar(calendarId);
  const viewType = arg.view.type;

  if (viewType.startsWith("list")) {
    return (
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {arg.event.title}
      </span>
    );
  }

  if (viewType === "dayGridMonth") {
    if (arg.event.allDay) {
      return (
        <div className="truncate px-1.5 py-0.5 text-xs font-medium text-white">
          {arg.event.title}
        </div>
      );
    }
    return (
      <div className="flex w-full items-center gap-1.5 overflow-hidden px-1.5 py-0.5">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: cal.color }}
        />
        {arg.timeText && (
          <span className="shrink-0 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            {arg.timeText}
          </span>
        )}
        <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
          {arg.event.title}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden px-1.5 py-1">
      <span className="truncate text-xs font-semibold text-white">
        {arg.event.title}
      </span>
      {arg.timeText && (
        <span className="truncate text-[11px] text-white/80">{arg.timeText}</span>
      )}
    </div>
  );
};

const Calendar: React.FC = () => {
  const calendarRef = useRef<FullCalendar>(null);
  const { isOpen, openModal, closeModal } = useModal();

  const [events, setEvents] = useState<AixEvent[]>(() => seedEvents());
  const [visibleCalendars, setVisibleCalendars] = useState<
    Record<CalendarId, boolean>
  >({ meetings: true, personal: true, agents: true, deadlines: true });
  const [currentView, setCurrentView] = useState<CalendarView>("dayGridMonth");
  const [viewTitle, setViewTitle] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [draft, setDraft] = useState<EventDraft>(() => emptyDraft());

  const getApi = () => calendarRef.current?.getApi();

  const fcEvents = useMemo<EventInput[]>(
    () =>
      events
        .filter((e) => visibleCalendars[e.calendar])
        .map((e) => {
          const cal = getCalendar(e.calendar);
          return {
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.allDay && e.end ? addDays(e.end, 1) : e.end,
            allDay: e.allDay ?? false,
            backgroundColor: hexToRgba(cal.color, 0.85),
            borderColor: cal.color,
            textColor: "#ffffff",
            extendedProps: { calendar: e.calendar },
          };
        }),
    [events, visibleCalendars]
  );

  const handleDatesSet = (arg: DatesSetArg) => {
    setViewTitle(arg.view.title);
    setCurrentView(arg.view.type as CalendarView);
    const api = getApi();
    if (api) setSelectedDate(api.getDate());
  };

  const handleMiniSelect = (date: Date) => {
    setSelectedDate(date);
    getApi()?.gotoDate(date);
  };

  const openCreate = () => {
    setDraft(emptyDraft());
    openModal();
  };

  const handleSelect = (info: DateSelectArg) => {
    const base = emptyDraft();
    if (info.allDay) {
      setDraft({
        ...base,
        allDay: true,
        start: fmtDate(info.start),
        end: info.end ? addDays(fmtDate(info.end), -1) : fmtDate(info.start),
      });
    } else {
      setDraft({
        ...base,
        allDay: false,
        start: fmtDateTime(info.start),
        end: info.end ? fmtDateTime(info.end) : "",
      });
    }
    getApi()?.unselect();
    openModal();
  };

  const handleEventClick = (info: EventClickArg) => {
    info.jsEvent.preventDefault();
    const ev = events.find((e) => e.id === info.event.id);
    if (!ev) return;
    setDraft({
      id: ev.id,
      title: ev.title,
      allDay: ev.allDay ?? false,
      start: ev.start,
      end: ev.end ?? (ev.allDay ? ev.start : ""),
      calendar: ev.calendar,
      location: ev.location ?? "",
      description: ev.description ?? "",
    });
    openModal();
  };

  const syncFromEventApi = (event: EventApi) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== event.id || !event.start) return e;
        if (event.allDay) {
          const end = event.end ? addDays(fmtDate(event.end), -1) : undefined;
          return {
            ...e,
            allDay: true,
            start: fmtDate(event.start),
            end: end && end !== fmtDate(event.start) ? end : undefined,
          };
        }
        return {
          ...e,
          allDay: false,
          start: fmtDateTime(event.start),
          end: event.end ? fmtDateTime(event.end) : undefined,
        };
      })
    );
  };

  const handleSave = () => {
    if (!draft.title.trim() || !draft.start) return;
    const saved: AixEvent = {
      id: draft.id ?? `e${Date.now()}`,
      title: draft.title.trim(),
      allDay: draft.allDay,
      start: draft.start,
      end: draft.end && draft.end !== draft.start ? draft.end : undefined,
      calendar: draft.calendar,
      location: draft.location.trim() || undefined,
      description: draft.description.trim() || undefined,
    };
    setEvents((prev) =>
      draft.id
        ? prev.map((e) => (e.id === draft.id ? saved : e))
        : [...prev, saved]
    );
    closeModal();
  };

  const handleDelete = () => {
    if (draft.id) {
      setEvents((prev) => prev.filter((e) => e.id !== draft.id));
    }
    closeModal();
  };

  const toggleCalendar = (id: CalendarId) => {
    setVisibleCalendars((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const navButtonClass =
    "flex size-9 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white/90 dark:focus-visible:ring-offset-gray-900";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:gap-6 lg:flex-row">
      <div data-aix-id="AIX-100.1" className="shrink-0 space-y-4 lg:w-64">
        <Button className="w-full" startIcon={<PlusIcon />} onClick={openCreate}>
          Create
        </Button>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <MiniMonth selectedDate={selectedDate} onSelectDate={handleMiniSelect} />
          <div className="my-4 border-t border-gray-100 dark:border-gray-800" />
          <p className="mb-2 px-2 text-sm font-semibold text-gray-800 dark:text-white/90">
            My calendars
          </p>
          <div className="space-y-0.5">
            {CALENDARS.map((cal) => {
              const checked = visibleCalendars[cal.id];
              return (
                <label
                  key={cal.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={checked}
                    onChange={() => toggleCalendar(cal.id)}
                  />
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/50 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-gray-900 ${
                      checked
                        ? "border-transparent"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                    style={checked ? { backgroundColor: cal.color } : undefined}
                  >
                    {checked && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2.5 6.2l2.3 2.3 4.7-5"
                          stroke="#fff"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {cal.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div
        data-aix-id="AIX-100.2"
        className="flex min-w-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-4 dark:border-gray-800 sm:gap-3 sm:px-5">
          <button
            type="button"
            onClick={() => getApi()?.today()}
            className="flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-300 dark:focus-visible:ring-offset-gray-900"
          >
            Today
          </button>
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => getApi()?.prev()}
              className={navButtonClass}
            >
              <Chevron direction="left" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => getApi()?.next()}
              className={navButtonClass}
            >
              <Chevron direction="right" />
            </button>
          </div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            {viewTitle}
          </h2>
          <div className="ml-auto flex w-full rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900 sm:w-auto">
            {VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => getApi()?.changeView(view.id)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 sm:flex-none ${
                  currentView === view.id
                    ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 p-2 sm:p-4">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={false}
            height="100%"
            events={fcEvents}
            selectable={true}
            selectMirror={true}
            editable={true}
            nowIndicator={true}
            dayMaxEvents={true}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            scrollTime="08:00:00"
            eventTimeFormat={{
              hour: "numeric",
              minute: "2-digit",
              omitZeroMinute: true,
              meridiem: "narrow",
            }}
            datesSet={handleDatesSet}
            select={handleSelect}
            eventClick={handleEventClick}
            eventDrop={(arg) => syncFromEventApi(arg.event)}
            eventResize={(arg) => syncFromEventApi(arg.event)}
            eventContent={renderEventContent}
          />
        </div>
      </div>

      <EventModal
        isOpen={isOpen}
        draft={draft}
        onChange={setDraft}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
};

export default Calendar;

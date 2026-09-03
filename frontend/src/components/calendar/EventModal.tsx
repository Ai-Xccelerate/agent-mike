"use client";
import React from "react";
import { Modal } from "@/components/ui/modal";
import { CALENDARS, CalendarId } from "./calendarData";

export interface EventDraft {
  id: string | null;
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  calendar: CalendarId;
  location: string;
  description: string;
}

interface EventModalProps {
  isOpen: boolean;
  draft: EventDraft;
  onChange: (draft: EventDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-400 dark:focus:border-brand-800 dark:[color-scheme:dark]";

const labelClass =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  draft,
  onChange,
  onClose,
  onSave,
  onDelete,
}) => {
  const set = (patch: Partial<EventDraft>) => onChange({ ...draft, ...patch });

  const toggleAllDay = () => {
    if (draft.allDay) {
      set({
        allDay: false,
        start: draft.start ? `${draft.start.slice(0, 10)}T09:00` : "",
        end: draft.end
          ? `${draft.end.slice(0, 10)}T10:00`
          : draft.start
          ? `${draft.start.slice(0, 10)}T10:00`
          : "",
      });
    } else {
      set({
        allDay: true,
        start: draft.start.slice(0, 10),
        end: draft.end.slice(0, 10),
      });
    }
  };

  const isEditing = draft.id !== null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[560px] p-6 lg:p-8">
      <div className="custom-scrollbar flex max-h-[80vh] flex-col overflow-y-auto px-1">
        <h5 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
          {isEditing ? "Edit event" : "New event"}
        </h5>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isEditing
            ? "Update the details or remove this event."
            : "Add an event to your AIX workspace calendar."}
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="event-title" className={labelClass}>
              Title
            </label>
            <input
              id="event-title"
              type="text"
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Add a title"
              className={inputClass}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-400">
              All day
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.allDay}
              aria-label="All day"
              onClick={toggleAllDay}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 ${
                draft.allDay ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-transform duration-150 ${
                  draft.allDay ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="event-start" className={labelClass}>
                Starts
              </label>
              <input
                id="event-start"
                type={draft.allDay ? "date" : "datetime-local"}
                value={draft.start}
                onChange={(e) => set({ start: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="event-end" className={labelClass}>
                Ends
              </label>
              <input
                id="event-end"
                type={draft.allDay ? "date" : "datetime-local"}
                value={draft.end}
                onChange={(e) => set({ end: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <span className={labelClass}>Calendar</span>
            <div className="flex flex-wrap gap-2">
              {CALENDARS.map((cal) => {
                const active = draft.calendar === cal.id;
                return (
                  <button
                    key={cal.id}
                    type="button"
                    onClick={() => set({ calendar: cal.id })}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-150 ${
                      active
                        ? "border-brand-300 bg-brand-50 font-medium text-gray-800 dark:border-brand-800 dark:bg-brand-500/10 dark:text-white/90"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: cal.color }}
                    />
                    {cal.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="event-location" className={labelClass}>
              Location <span className="text-gray-500 dark:text-gray-400">(optional)</span>
            </label>
            <input
              id="event-location"
              type="text"
              value={draft.location}
              onChange={(e) => set({ location: e.target.value })}
              placeholder="Add a location or meeting link"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="event-description" className={labelClass}>
              Description <span className="text-gray-500 dark:text-gray-400">(optional)</span>
            </label>
            <textarea
              id="event-description"
              rows={3}
              value={draft.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Add notes or an agenda"
              className={`${inputClass} h-auto resize-none`}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse items-center gap-3 sm:flex-row">
          {isEditing && (
            <button
              type="button"
              onClick={onDelete}
              className="flex w-full justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-error-600 transition-colors duration-150 hover:bg-error-50 dark:text-error-500 dark:hover:bg-error-500/10 sm:w-auto"
            >
              Delete
            </button>
          )}
          <div className="flex w-full flex-col-reverse gap-3 sm:ml-auto sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!draft.title.trim() || !draft.start}
              className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default EventModal;

"use client";

import React, { useMemo, useState } from "react";
import AgentAvatar, { AgentName } from "@/components/aix/AgentAvatar";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { PlusIcon } from "@/icons";

type Status = "todo" | "inprogress" | "done";
type Priority = "High" | "Medium" | "Low";

type Assignee =
  | { kind: "agent"; name: AgentName }
  | { kind: "human"; name: string };

interface Task {
  id: number;
  title: string;
  project: string;
  due: string;
  overdue?: boolean;
  priority: Priority;
  status: Status;
  assignee: Assignee;
}

const initialTasks: Task[] = [
  // To do (8)
  { id: 1, title: "Review Nick's Q3 campaign copy", project: "Demand gen", due: "Today", priority: "High", status: "todo", assignee: { kind: "human", name: "Rahul Bhavsar" } },
  { id: 2, title: "Approve Jules sequence for Stark Industries", project: "Outbound", due: "Jul 1", overdue: true, priority: "High", status: "todo", assignee: { kind: "human", name: "Maya Chen" } },
  { id: 3, title: "Tune Pepper routing rules for enterprise inbound", project: "Inbound", due: "Tomorrow", priority: "Medium", status: "todo", assignee: { kind: "agent", name: "Pepper" } },
  { id: 4, title: "Draft onboarding checklist for Meridian Health", project: "Onboarding", due: "Jul 8", priority: "Medium", status: "todo", assignee: { kind: "human", name: "Priya Nair" } },
  { id: 5, title: "QA George's renewal outreach templates", project: "Retention", due: "Jul 9", priority: "Low", status: "todo", assignee: { kind: "agent", name: "George" } },
  { id: 6, title: "Set up Langfuse traces for Tony's KB answers", project: "Platform", due: "Jun 30", overdue: true, priority: "High", status: "todo", assignee: { kind: "human", name: "Sam Okafor" } },
  { id: 7, title: "Schedule pipeline review with Delta Freight", project: "Deal ops", due: "Jul 10", priority: "Low", status: "todo", assignee: { kind: "human", name: "Rahul Bhavsar" } },
  { id: 8, title: "Update ICP filters in Nick's audience builder", project: "Demand gen", due: "Jul 11", priority: "Medium", status: "todo", assignee: { kind: "agent", name: "Nick" } },
  // In progress (9)
  { id: 9, title: "Rewrite Jules follow-up cadence for Stark", project: "Outbound", due: "Today", priority: "High", status: "inprogress", assignee: { kind: "agent", name: "Jules" } },
  { id: 10, title: "Define Pepper-to-Joy handoff rules for closed-won", project: "Deal ops", due: "Tomorrow", priority: "Medium", status: "inprogress", assignee: { kind: "agent", name: "Joy" } },
  { id: 11, title: "Ingest 42 technical docs into Tony's knowledge base", project: "Platform", due: "Jul 7", priority: "High", status: "inprogress", assignee: { kind: "agent", name: "Tony" } },
  { id: 12, title: "Automate proposal drafts for the Northwind deal", project: "Deal ops", due: "Jul 8", priority: "Medium", status: "inprogress", assignee: { kind: "agent", name: "Joy" } },
  { id: 13, title: "Calibrate George's churn-risk scoring model", project: "Retention", due: "Jul 2", overdue: true, priority: "High", status: "inprogress", assignee: { kind: "agent", name: "George" } },
  { id: 14, title: "Migrate campaign metrics to the v2 dashboard", project: "Platform", due: "Jul 9", priority: "Medium", status: "inprogress", assignee: { kind: "human", name: "Sam Okafor" } },
  { id: 15, title: "Run LinkedIn ad variant test for Nick", project: "Demand gen", due: "Jul 10", priority: "Low", status: "inprogress", assignee: { kind: "agent", name: "Nick" } },
  { id: 16, title: "Rewrite objection-handling snippets for outbound", project: "Outbound", due: "Jul 11", priority: "Low", status: "inprogress", assignee: { kind: "human", name: "Maya Chen" } },
  { id: 17, title: "Instrument reply-rate alerts for all sequences", project: "Platform", due: "Jul 14", priority: "Medium", status: "inprogress", assignee: { kind: "human", name: "Priya Nair" } },
  // Done (7)
  { id: 18, title: "Ship Pepper v2 routing to production", project: "Inbound", due: "Jun 27", priority: "High", status: "done", assignee: { kind: "human", name: "Sam Okafor" } },
  { id: 19, title: "Approve June invoice run for active customers", project: "Finance", due: "Jun 28", priority: "Medium", status: "done", assignee: { kind: "human", name: "Rahul Bhavsar" } },
  { id: 20, title: "Localize Jules sequences for EU prospects", project: "Outbound", due: "Jun 26", priority: "Medium", status: "done", assignee: { kind: "agent", name: "Jules" } },
  { id: 21, title: "Close out Acme Logistics pilot retro notes", project: "Onboarding", due: "Jun 25", priority: "Low", status: "done", assignee: { kind: "human", name: "Priya Nair" } },
  { id: 22, title: "Enable dark mode on the client portal", project: "Platform", due: "Jun 24", priority: "Low", status: "done", assignee: { kind: "human", name: "Sam Okafor" } },
  { id: 23, title: "Review George's win-back campaign copy", project: "Retention", due: "Jun 23", priority: "Medium", status: "done", assignee: { kind: "agent", name: "George" } },
  { id: 24, title: "Fix duplicate lead merge in the CRM sync", project: "Platform", due: "Jun 20", priority: "High", status: "done", assignee: { kind: "human", name: "Maya Chen" } },
];

const statusLabels: Record<Status, string> = {
  todo: "To do",
  inprogress: "In progress",
  done: "Done",
};

const priorityColor: Record<Priority, "error" | "warning" | "light"> = {
  High: "error",
  Medium: "warning",
  Low: "light",
};

function HumanAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join("");
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
      {initials}
    </span>
  );
}

function AssigneeCell({ assignee }: { assignee: Assignee }) {
  return (
    <span className="flex items-center gap-2">
      {assignee.kind === "agent" ? (
        <AgentAvatar name={assignee.name} size="sm" />
      ) : (
        <HumanAvatar name={assignee.name} />
      )}
      <span className="hidden text-sm text-gray-500 dark:text-gray-400 md:inline">
        {assignee.name}
      </span>
    </span>
  );
}

type FilterKey = "all" | Status;

export default function TaskList() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    project: "Demand gen",
    due: "",
    priority: "Medium" as Priority,
  });

  const counts = useMemo(() => {
    const c = { all: tasks.length, todo: 0, inprogress: 0, done: 0 };
    tasks.forEach((t) => {
      c[t.status] += 1;
    });
    return c;
  }, [tasks]);

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "todo", label: "To do", count: counts.todo },
    { key: "inprogress", label: "In progress", count: counts.inprogress },
    { key: "done", label: "Done", count: counts.done },
  ];

  const groups: Status[] =
    filter === "all" ? ["todo", "inprogress", "done"] : [filter];

  const toggleChecked = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const addTask = () => {
    if (!form.title.trim()) return;
    setTasks((prev) => [
      {
        id: Math.max(...prev.map((t) => t.id)) + 1,
        title: form.title.trim(),
        project: form.project,
        due: form.due || "No due date",
        priority: form.priority,
        status: "todo",
        assignee: { kind: "human", name: "Rahul Bhavsar" },
      },
      ...prev,
    ]);
    setForm({ title: "", project: "Demand gen", due: "", priority: "Medium" });
    setModalOpen(false);
  };

  const inputClass =
    "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-5 pt-4 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between md:px-6">
        <div className="-mb-px flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150 sm:px-4 ${
                filter === f.key
                  ? "border-brand-500 text-brand-500"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {f.label}
              <span
                className={`rounded-full px-2 py-0.5 text-theme-xs font-medium ${
                  filter === f.key
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                    : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400"
                }`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>
        <div className="pb-3 sm:pb-2">
          <Button
            size="sm"
            startIcon={<PlusIcon />}
            onClick={() => setModalOpen(true)}
          >
            Add task
          </Button>
        </div>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {groups.map((status) => {
          const groupTasks = tasks.filter((t) => t.status === status);
          return (
            <div key={status}>
              <div className="flex items-center gap-2 bg-gray-50 px-5 py-2.5 dark:bg-white/[0.02] md:px-6">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {statusLabels[status]}
                </h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {groupTasks.length}
                </span>
              </div>
              {groupTasks.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                  Nothing here yet — add a task to get started.
                </p>
              ) : (
                groupTasks.map((task) => {
                  const isDone = task.status === "done" || checked.has(task.id);
                  return (
                    <div
                      key={task.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 px-5 py-3.5 transition-colors duration-150 first:border-t-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.02] md:px-6"
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 basis-full sm:basis-auto">
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={() => toggleChecked(task.id)}
                          className="size-4 shrink-0 cursor-pointer rounded border-gray-300 text-brand-500 accent-brand-500 dark:border-gray-700"
                        />
                        <span
                          className={`truncate text-sm font-medium ${
                            isDone
                              ? "text-gray-400 line-through dark:text-gray-500"
                              : "text-gray-800 dark:text-white/90"
                          }`}
                        >
                          {task.title}
                        </span>
                      </label>
                      <span className="hidden rounded-full bg-gray-100 px-2.5 py-0.5 text-theme-xs font-medium text-gray-600 dark:bg-white/5 dark:text-gray-400 md:inline-flex">
                        {task.project}
                      </span>
                      <span
                        className={`w-20 text-sm ${
                          task.overdue && task.status !== "done"
                            ? "font-medium text-error-500"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {task.due}
                      </span>
                      <span className="w-16">
                        <Badge
                          size="sm"
                          color={priorityColor[task.priority]}
                        >
                          {task.priority === "Medium" ? "Med" : task.priority}
                        </Badge>
                      </span>
                      <span className="w-8 md:w-40">
                        <AssigneeCell assignee={task.assignee} />
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        className="max-w-[540px] p-6 sm:p-8 mx-4"
      >
        <h4 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
          Add task
        </h4>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          New tasks land in To do, assigned to you.
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Review Pepper's routing changes"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Project
              </label>
              <select
                value={form.project}
                onChange={(e) => setForm({ ...form, project: e.target.value })}
                className={inputClass}
              >
                {["Demand gen", "Outbound", "Inbound", "Deal ops", "Retention", "Platform", "Onboarding"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Due date
              </label>
              <input
                type="text"
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
                placeholder="Jul 12"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as Priority })
                }
                className={inputClass}
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button size="sm" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={addTask}>
              Add task
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

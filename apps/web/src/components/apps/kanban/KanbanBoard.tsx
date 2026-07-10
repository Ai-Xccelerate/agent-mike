"use client";

import React, { useEffect, useRef, useState } from "react";
import { DndProvider, useDrag, useDragLayer, useDrop } from "react-dnd";
import { HTML5Backend, getEmptyImage } from "react-dnd-html5-backend";
import AgentAvatar, { AgentName } from "@/components/aix/AgentAvatar";
import { ChatIcon, PlusIcon } from "@/icons";

type ColumnId = "todo" | "inprogress" | "review" | "done";
type Priority = "High" | "Medium" | "Low";

type Assignee =
  | { kind: "agent"; name: AgentName }
  | { kind: "human"; name: string };

interface Card {
  id: number;
  title: string;
  project: string;
  priority: Priority;
  assignee: Assignee;
  comments: number;
}

const CARD_TYPE = "KANBAN_CARD";

const initialColumns: Record<ColumnId, Card[]> = {
  todo: [
    { id: 1, title: "Review Nick's Q3 campaign copy", project: "Demand gen", priority: "High", assignee: { kind: "human", name: "Rahul Bhavsar" }, comments: 3 },
    { id: 2, title: "Tune Pepper routing rules for enterprise inbound", project: "Inbound", priority: "Medium", assignee: { kind: "agent", name: "Pepper" }, comments: 1 },
    { id: 3, title: "Draft onboarding checklist for Meridian Health", project: "Onboarding", priority: "Medium", assignee: { kind: "human", name: "Priya Nair" }, comments: 0 },
    { id: 4, title: "Update ICP filters in Nick's audience builder", project: "Demand gen", priority: "Low", assignee: { kind: "agent", name: "Nick" }, comments: 2 },
  ],
  inprogress: [
    { id: 5, title: "Rewrite Jules follow-up cadence for Stark", project: "Outbound", priority: "High", assignee: { kind: "agent", name: "Jules" }, comments: 6 },
    { id: 6, title: "Ingest 42 technical docs into Tony's knowledge base", project: "Platform", priority: "High", assignee: { kind: "agent", name: "Tony" }, comments: 4 },
    { id: 7, title: "Automate proposal drafts for the Northwind deal", project: "Deal ops", priority: "Medium", assignee: { kind: "agent", name: "Joy" }, comments: 2 },
    { id: 8, title: "Migrate campaign metrics to the v2 dashboard", project: "Platform", priority: "Medium", assignee: { kind: "human", name: "Sam Okafor" }, comments: 5 },
  ],
  review: [
    { id: 9, title: "Calibrate George's churn-risk scoring model", project: "Retention", priority: "High", assignee: { kind: "agent", name: "George" }, comments: 3 },
    { id: 10, title: "Approve Jules sequence for Stark Industries", project: "Outbound", priority: "High", assignee: { kind: "human", name: "Maya Chen" }, comments: 8 },
    { id: 11, title: "QA George's renewal outreach templates", project: "Retention", priority: "Low", assignee: { kind: "human", name: "Priya Nair" }, comments: 1 },
  ],
  done: [
    { id: 12, title: "Ship Pepper v2 routing to production", project: "Inbound", priority: "High", assignee: { kind: "human", name: "Sam Okafor" }, comments: 7 },
    { id: 13, title: "Localize Jules sequences for EU prospects", project: "Outbound", priority: "Medium", assignee: { kind: "agent", name: "Jules" }, comments: 2 },
    { id: 14, title: "Review George's win-back campaign copy", project: "Retention", priority: "Medium", assignee: { kind: "agent", name: "George" }, comments: 4 },
    { id: 15, title: "Fix duplicate lead merge in the CRM sync", project: "Platform", priority: "Low", assignee: { kind: "human", name: "Maya Chen" }, comments: 3 },
  ],
};

const columnMeta: { id: ColumnId; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "inprogress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const priorityDot: Record<Priority, string> = {
  High: "bg-error-500",
  Medium: "bg-warning-500",
  Low: "bg-gray-400",
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

interface DragItem {
  id: number;
  from: ColumnId;
  card: Card;
  width?: number;
}

/* Presentational card face — shared by the live card and the drag preview so
   the thing under the cursor looks exactly like the card that was picked up. */
function CardFace({ card }: { card: Card }) {
  return (
    <>
      <div className="mb-3 flex items-start gap-2">
        <span
          className={`mt-1.5 size-2 shrink-0 rounded-full ${priorityDot[card.priority]}`}
          title={`${card.priority} priority`}
        />
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
          {card.title}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-theme-xs font-medium text-gray-600 dark:bg-white/5 dark:text-gray-400">
          {card.project}
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-theme-xs text-gray-500 dark:text-gray-400">
            <ChatIcon className="size-4" />
            {card.comments}
          </span>
          {card.assignee.kind === "agent" ? (
            <AgentAvatar name={card.assignee.name} size="sm" />
          ) : (
            <HumanAvatar name={card.assignee.name} />
          )}
        </div>
      </div>
    </>
  );
}

function KanbanCard({
  card,
  column,
  justLanded,
  onLandDone,
}: {
  card: Card;
  column: ColumnId;
  justLanded: boolean;
  onLandDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isDragging }, drag, preview] = useDrag<
    DragItem,
    void,
    { isDragging: boolean }
  >(
    () => ({
      type: CARD_TYPE,
      // Function form so the source card's rendered width is measured at drag
      // start — the preview then matches the fluid column width exactly.
      item: () => ({
        id: card.id,
        from: column,
        card,
        width: ref.current?.offsetWidth,
      }),
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [card.id, column]
  );

  // Hide the browser's default drag ghost — the custom CardDragLayer draws a
  // nicer lifted preview instead.
  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  // Bring a freshly landed card into view so its ring-flash is never hidden
  // below the fold of an overflowing column.
  useEffect(() => {
    if (!justLanded || !ref.current) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current.scrollIntoView({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [justLanded]);

  drag(ref);

  return (
    <div
      ref={ref}
      onAnimationEnd={justLanded ? onLandDone : undefined}
      className={`cursor-grab rounded-xl border p-4 transition-[border-color,transform,opacity] duration-150 active:cursor-grabbing ${
        isDragging
          ? "border-dashed border-gray-300 bg-gray-100/60 opacity-50 dark:border-gray-700 dark:bg-white/[0.02]"
          : "border-gray-200 bg-white hover:-translate-y-px hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
      } ${justLanded ? "animate-kanban-land" : ""}`}
    >
      {/* When dragging, keep the space but blank the content so it reads as an
          empty slot the card left behind. */}
      <div className={isDragging ? "invisible" : ""}>
        <CardFace card={card} />
      </div>
    </div>
  );
}

/* Floating preview that follows the cursor — a slight lift + tilt + shadow so
   the pickup feels physical. */
function CardDragLayer() {
  const { isDragging, item, offset } = useDragLayer((monitor) => ({
    item: monitor.getItem() as DragItem | null,
    offset: monitor.getSourceClientOffset(),
    isDragging: monitor.isDragging(),
  }));

  if (!isDragging || !offset || !item?.card) return null;

  return (
    <div className="pointer-events-none fixed left-0 top-0 z-[1000]">
      <div
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div
          style={{ width: item.width ?? 288 }}
          className="rotate-3 rounded-xl border border-brand-300 bg-white p-4 shadow-theme-lg ring-1 ring-brand-500/30 dark:border-brand-500/50 dark:bg-gray-900"
        >
          <CardFace card={item.card} />
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  column,
  label,
  cards,
  bump,
  landedId,
  onDropCard,
  onLandDone,
  onBumpDone,
}: {
  column: ColumnId;
  label: string;
  cards: Card[];
  bump: boolean;
  landedId: number | null;
  onDropCard: (id: number, from: ColumnId, to: ColumnId) => void;
  onLandDone: () => void;
  onBumpDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isOver, draggedFrom }, drop] = useDrop<
    DragItem,
    void,
    { isOver: boolean; draggedFrom: ColumnId | null }
  >(
    () => ({
      accept: CARD_TYPE,
      drop: (item) => onDropCard(item.id, item.from, column),
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        draggedFrom: monitor.getItem()?.from ?? null,
      }),
    }),
    [column, onDropCard]
  );
  drop(ref);

  // Only signal a landing zone when the card actually comes from elsewhere.
  const showDropHint = isOver && draggedFrom !== null && draggedFrom !== column;

  return (
    <div
      ref={ref}
      className={`flex h-full min-w-0 flex-col rounded-2xl border transition-colors duration-150 ${
        showDropHint
          ? "border-brand-400 bg-brand-50/60 dark:border-brand-500/50 dark:bg-brand-500/[0.06]"
          : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-shrink-0 items-center gap-2 px-4 pb-2 pt-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {label}
        </h3>
        <span
          onAnimationEnd={bump ? onBumpDone : undefined}
          className={`rounded-full px-2 py-0.5 text-theme-xs font-medium tabular-nums ${
            bump ? "animate-badge-pop" : ""
          } ${
            column === "inprogress"
              ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
              : "bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-400"
          }`}
        >
          {cards.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
        {cards.map((card) => (
          <KanbanCard
            key={card.id}
            card={card}
            column={column}
            justLanded={card.id === landedId}
            onLandDone={onLandDone}
          />
        ))}
        {showDropHint && (
          <div className="rounded-xl border-2 border-dashed border-brand-400 bg-brand-50/50 px-4 py-6 text-center text-sm font-semibold text-brand-800 dark:border-brand-500/50 dark:bg-brand-500/[0.06] dark:text-brand-300">
            Drop here
          </div>
        )}
        {cards.length === 0 && !showDropHint && (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Drop a card here
          </p>
        )}
        <button className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-500 transition-colors duration-150 hover:bg-white hover:text-brand-500 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-brand-400">
          <PlusIcon className="size-4" />
          Add card
        </button>
      </div>
    </div>
  );
}

export default function KanbanBoard() {
  const [columns, setColumns] = useState(initialColumns);
  // The card that just landed (for the ring-flash) and the column that just
  // changed count (for the badge pop).
  const [landedId, setLandedId] = useState<number | null>(null);
  const [bumpCols, setBumpCols] = useState<ColumnId[]>([]);

  const onDropCard = (id: number, from: ColumnId, to: ColumnId) => {
    if (from === to) return;
    setColumns((prev) => {
      const card = prev[from].find((c) => c.id === id);
      if (!card) return prev;
      return {
        ...prev,
        [from]: prev[from].filter((c) => c.id !== id),
        [to]: [...prev[to], card],
      };
    });
    setLandedId(id);
    setBumpCols([from, to]);
  };

  // Fallback cleanup: prefers-reduced-motion disables the CSS animations, so
  // animationend never fires — reset the one-shot state on a timer instead.
  useEffect(() => {
    if (landedId == null) return;
    const t = setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);
  useEffect(() => {
    if (bumpCols.length === 0) return;
    const t = setTimeout(() => setBumpCols([]), 600);
    return () => clearTimeout(t);
  }, [bumpCols]);

  return (
    <DndProvider backend={HTML5Backend}>
      <CardDragLayer />
      <div className="min-h-0 flex-1 overflow-x-auto pb-2">
        <div
          className="grid h-full items-stretch gap-4 md:gap-5"
          style={{
            gridTemplateColumns: `repeat(${columnMeta.length}, minmax(17.5rem, 1fr))`,
          }}
        >
          {columnMeta.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col.id}
              label={col.label}
              cards={columns[col.id]}
              bump={bumpCols.includes(col.id)}
              landedId={landedId}
              onDropCard={onDropCard}
              onLandDone={() => setLandedId(null)}
              onBumpDone={() =>
                setBumpCols((prev) => prev.filter((c) => c !== col.id))
              }
            />
          ))}
        </div>
      </div>
    </DndProvider>
  );
}

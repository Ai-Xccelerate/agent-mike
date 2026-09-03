"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CategoryId,
  Email,
  FolderId,
  LabelId,
  initialEmails,
} from "./inboxData";
import ComposeCard from "./ComposeCard";
import InboxList from "./InboxList";
import InboxRail from "./InboxRail";
import InboxThread from "./InboxThread";

export default function InboxApp() {
  const [emails, setEmails] = useState<Email[]>(initialEmails);
  const [activeFolder, setActiveFolder] = useState<FolderId>("inbox");
  const [activeLabel, setActiveLabel] = useState<LabelId | null>(null);
  const [tab, setTab] = useState<CategoryId>("primary");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [page, setPage] = useState(0);
  const savedScroll = useRef(0);

  const visible = useMemo(
    () =>
      emails
        .filter((e) =>
          activeFolder === "starred"
            ? e.starred && e.folder !== "trash"
            : e.folder === activeFolder
        )
        .filter((e) => activeFolder !== "inbox" || e.category === tab)
        .filter((e) => !activeLabel || e.label === activeLabel),
    [emails, activeFolder, tab, activeLabel]
  );

  const tabCounts = useMemo(() => {
    const counts: Record<CategoryId, number> = { primary: 0, team: 0, updates: 0 };
    emails
      .filter((e) => e.folder === "inbox")
      .filter((e) => !activeLabel || e.label === activeLabel)
      .forEach((e) => {
        counts[e.category] += 1;
      });
    return counts;
  }, [emails, activeLabel]);

  const folderCounts = useMemo(
    () => ({
      inbox: emails.filter((e) => e.folder === "inbox").length,
      drafts: emails.filter((e) => e.folder === "drafts").length,
    }),
    [emails]
  );

  const openEmail = (id: string) => {
    savedScroll.current = window.scrollY;
    setOpenId(id);
    markRead([id], true);
  };

  useEffect(() => {
    if (openId === null) window.scrollTo({ top: savedScroll.current });
  }, [openId]);

  const moveToFolder = (ids: string[], folder: FolderId) => {
    setEmails((prev) =>
      prev.map((e) => (ids.includes(e.id) ? { ...e, folder } : e))
    );
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const markRead = (ids: string[], read: boolean) => {
    setEmails((prev) =>
      prev.map((e) => (ids.includes(e.id) ? { ...e, unread: !read } : e))
    );
  };

  const toggleStar = (id: string) =>
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e))
    );

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = (select: boolean) =>
    setSelected(select ? new Set(visible.map((e) => e.id)) : new Set());

  const changeFolder = (folder: FolderId) => {
    setActiveFolder(folder);
    setSelected(new Set());
    setOpenId(null);
    setPage(0);
  };

  const changeLabel = (label: LabelId | null) => {
    setActiveLabel(label);
    setSelected(new Set());
    setOpenId(null);
  };

  const changeTab = (next: CategoryId) => {
    setTab(next);
    setSelected(new Set());
  };

  const openEmailData = openId
    ? emails.find((e) => e.id === openId) ?? null
    : null;
  const openIndex = openId ? visible.findIndex((e) => e.id === openId) : -1;

  const threadAction = (action: () => void) => {
    const next = visible[openIndex + 1] ?? visible[openIndex - 1] ?? null;
    action();
    if (next) {
      setOpenId(next.id);
      markRead([next.id], true);
    } else {
      setOpenId(null);
    }
  };

  return (
    <>
      <div className="flex min-h-0 w-full flex-1 flex-col gap-5 lg:flex-row lg:gap-6">
        <div data-aix-id="AIX-108.1" className="w-full lg:w-auto lg:shrink-0">
          <InboxRail
            activeFolder={activeFolder}
            onFolderChange={changeFolder}
            activeLabel={activeLabel}
            onLabelChange={changeLabel}
            onCompose={() => setComposeOpen(true)}
            counts={folderCounts}
          />
        </div>

        <div
          data-aix-id="AIX-108.2"
          className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
        >
          {openEmailData ? (
            <InboxThread
              email={openEmailData}
              position={openIndex + 1}
              total={visible.length}
              onBack={() => setOpenId(null)}
              onPrev={() => {
                const prev = visible[openIndex - 1];
                if (prev) openEmail(prev.id);
              }}
              onNext={() => {
                const next = visible[openIndex + 1];
                if (next) openEmail(next.id);
              }}
              onArchive={() =>
                threadAction(() => moveToFolder([openEmailData.id], "archive"))
              }
              onDelete={() =>
                threadAction(() => moveToFolder([openEmailData.id], "trash"))
              }
              onMarkUnread={() => {
                markRead([openEmailData.id], false);
                setOpenId(null);
              }}
              onToggleStar={() => toggleStar(openEmailData.id)}
            />
          ) : (
            <InboxList
              emails={visible}
              folder={activeFolder}
              tab={tab}
              onTabChange={changeTab}
              tabCounts={tabCounts}
              selected={selected}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAll}
              onOpen={openEmail}
              onToggleStar={toggleStar}
              onArchive={(ids) => moveToFolder(ids, "archive")}
              onDelete={(ids) => moveToFolder(ids, "trash")}
              onMarkRead={markRead}
              onSnooze={(id) => moveToFolder([id], "snoozed")}
              page={page}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>

      {composeOpen && (
        <div data-aix-id="AIX-108.3">
          <ComposeCard onClose={() => setComposeOpen(false)} />
        </div>
      )}
    </>
  );
}

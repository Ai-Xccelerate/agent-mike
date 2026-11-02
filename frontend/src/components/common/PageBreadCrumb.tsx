"use client";

/**
 * A page's head (AIX-F3) -- kept under its old name, so every page that drew a
 * breadcrumb now draws the head Artifacts and Persuade draw.
 *
 * There is no breadcrumb trail any more, on purpose: the sidebar already says
 * where you are (the raised row), and a trail of "Home > Page" repeated it.
 * The section the page sits in is the eyebrow over the title instead, read
 * from the navigation registry, so it is never out of step with the sidebar.
 *
 * For a new page, prefer `PageHead` inside a page shape (`GridPage`,
 * `ListPage`, `DetailPage` in `components/page/PageShell`); this is the same
 * head with the page's spacing under it.
 */

import { usePathname } from "next/navigation";
import React from "react";

import { PageHead } from "@/components/common/PageHead";
import { pageAt } from "@/layout/navigation";

interface PageBreadcrumbProps {
  pageTitle: React.ReactNode;
  /** Words over the title. The page's section in the sidebar by default. */
  eyebrow?: React.ReactNode;
  /** One line that is true right now ("12 open, 3 overdue"), not a description. */
  context?: React.ReactNode;
  /** The page's one orange moment, if it has one. */
  action?: React.ReactNode;
  /** Controls that belong to the title (a status, an owner), under the context. */
  meta?: React.ReactNode;
}

const PageBreadcrumb: React.FC<PageBreadcrumbProps> = ({ pageTitle, eyebrow, context, action, meta }) => {
  const pathname = usePathname();
  const section = eyebrow ?? pageAt(pathname)?.section ?? null;
  return (
    <div data-aix-id="AIX-F3" className="mb-6 md:mb-7">
      <PageHead eyebrow={section} title={pageTitle} context={context} action={action} meta={meta} />
    </div>
  );
};

export default PageBreadcrumb;

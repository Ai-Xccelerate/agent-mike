# AIX Theme — Reference ID System & Master Index

The canonical addressing scheme for the AIX reusable UI/UX theme. Every view,
frame region, and component instance has a stable ID so we can point at anything
precisely: *"change AIX-311.2"* = the 2nd block on the Data Tables page.

This is not a demo app. It is a component library / ready-to-use AIX theme —
every primitive is generic and prop-driven so it drops into any AIX app, agent,
or workforce template.

---

## 1. ID Format

```
AIX-<PAGE>            a view / page            e.g. AIX-311
AIX-<PAGE>.<c>        a component block on it  e.g. AIX-311.2
AIX-<PAGE>.<c>.<e>    a sub-element in a block e.g. AIX-311.2.3
AIX-F<n>             a persistent frame region (chrome shared by every page)
LIB-<NAME>           a reusable library primitive (framework-agnostic of page)
```

Rendered elements carry the ID as a `data-aix-id` attribute, so any block is
discoverable straight from the DOM / devtools.

### Frame regions (the "whole frame" — present on every admin page)

| ID | Region | Source |
|----|--------|--------|
| `AIX-F1` | Left sidebar / nav | `layout/AppSidebar.tsx` |
| `AIX-F2` | Top bar (search, theme, bell, user) | `layout/AppHeader.tsx` |
| `AIX-F3` | Page breadcrumb / title | `components/common/PageBreadCrumb.tsx` |
| `AIX-F4` | Main content region | `layout/(admin)/layout.tsx` |
| `AIX-F5` | Sidebar CTA widget | `layout/SidebarWidget.tsx` |

---

## 2. Page number ranges (by area)

Numbers are grouped by area so the range tells you the area at a glance. Gaps
are intentional — room to insert siblings without renumbering.

| Range | Area |
|-------|------|
| 000–009 | Global chrome / shells |
| 010–049 | Dashboards |
| 050–099 | E-commerce |
| 100–149 | Applications |
| 150–199 | AI tools |
| 200–299 | UI Elements |
| 300–349 | Forms & Tables |
| 350–399 | Charts & Maps |
| 400–449 | Pages (misc) |
| 450–499 | Authentication |
| 500–549 | Errors / system |
| 550–599 | Layout variants |

---

## 3. Master Index  ·  ✅ built · ⬜ to build

### Global chrome & docs (000–009)
| ID | Page | Status |
|----|------|--------|
| AIX-001 | Design System (live) — `/design-system` | ✅ |
| AIX-002 | Reference Index (live, from `aix-manifest.json`) — `/reference` | ✅ |

### Dashboards (010–049) — AIX-native (AI workforce), not generic clones
| ID | Page | Status |
|----|------|--------|
| AIX-010 | Ecommerce (home `/`) | ✅ |
| AIX-011 | Workforce Overview (all 6 agents) — `/workforce` | ✅ |
| AIX-012 | Demand Gen — Nick — `/demand-gen` | ✅ |
| AIX-013 | Outbound — Jules — `/outbound` | ✅ |
| AIX-014 | Inbound — Pepper — `/inbound` | ✅ |
| AIX-015 | Technical — Tony — `/technical` | ✅ |
| AIX-016 | Deal Ops — Joy — `/deal-ops` | ✅ |
| AIX-017 | Retention — George — `/retention` | ✅ |
| AIX-018 | Revenue (company-level) — `/revenue` | ✅ |
| AIX-019 | Client Account view — `/client-account` | ✅ |

### E-commerce (050–099)
| ID | Page | Status |
|----|------|--------|
| AIX-050 | Products List | ✅ |
| AIX-051 | Add Product | ✅ |
| AIX-052 | Billing | ✅ |
| AIX-053 | Invoices | ✅ |
| AIX-054 | Single Invoice | ✅ |
| AIX-055 | Create Invoice | ✅ |
| AIX-056 | Transactions | ✅ |
| AIX-057 | Single Transaction | ✅ |

### Applications (100–149)
| ID | Page | Status |
|----|------|--------|
| AIX-100 | Calendar | ✅ |
| AIX-101 | User Profile | ✅ |
| AIX-102 | Task List | ✅ |
| AIX-103 | Task Kanban | ✅ |
| AIX-104 | File Manager | ✅ |
| AIX-105 | Chat | ✅ |
| AIX-106 | Support Tickets (list) | ✅ |
| AIX-107 | Ticket Reply | ✅ |
| AIX-108 | Inbox | ✅ |
| AIX-109 | Inbox Details | ✅ |
| AIX-110 | Transcripts (Scribe sync) — `/transcripts` | ✅ |
| AIX-111 | Transcript Detail — `/transcript-detail` | ✅ |

### AI tools (150–199)
| ID | Page | Status |
|----|------|--------|
| AIX-150 | Text Generator | ✅ |
| AIX-151 | Image Generator | ✅ |
| AIX-152 | Code Generator | ✅ |
| AIX-153 | Video Generator | ✅ |
| AIX-154 | AI Settings | ✅ |
| AIX-155 | AI Assistant (Sam) — `/assistant` | ✅ |

### UI Elements (200–299)
| ID | Page | Status |
|----|------|--------|
| AIX-200 | Alerts | ✅ |
| AIX-201 | Avatars | ✅ |
| AIX-202 | Badge | ✅ |
| AIX-203 | Buttons | ✅ |
| AIX-204 | Images | ✅ |
| AIX-205 | Videos | ✅ |
| AIX-206 | Tabs | ✅ |
| AIX-207 | Breadcrumb | ✅ |
| AIX-208 | Buttons Group | ✅ |
| AIX-209 | Cards | ✅ |
| AIX-210 | Carousel | ✅ |
| AIX-211 | Dropdowns | ✅ |
| AIX-212 | Links | ✅ |
| AIX-213 | List | ✅ |
| AIX-214 | Modals | ✅ |
| AIX-215 | Notifications | ✅ |
| AIX-216 | Pagination | ✅ |
| AIX-217 | Popovers | ✅ |
| AIX-218 | Progress Bar | ✅ |
| AIX-219 | Ribbons | ✅ |
| AIX-220 | Spinners | ✅ |
| AIX-221 | Tooltips | ✅ |

### Forms & Tables (300–349)
| ID | Page | Status |
|----|------|--------|
| AIX-300 | Form Elements | ✅ |
| AIX-301 | Form Layout | ✅ |
| AIX-310 | Basic Tables | ✅ |
| AIX-311 | Data Tables | ✅ |

### Charts & Maps (350–399)
| ID | Page | Status |
|----|------|--------|
| AIX-350 | Line Chart | ✅ |
| AIX-351 | Bar Chart | ✅ |
| AIX-352 | Pie Chart | ✅ |
| AIX-353 | Radar Chart | ✅ |
| AIX-354 | Radial Chart | ✅ |
| AIX-360 | Map | ✅ |
| AIX-361 | Vector Map | ✅ |

### Pages — misc (400–449)
| ID | Page | Status |
|----|------|--------|
| AIX-400 | Blank | ✅ |
| AIX-401 | Pricing Tables | ✅ |
| AIX-402 | FAQ | ✅ |
| AIX-403 | API Keys | ✅ |
| AIX-404 | Integrations | ✅ |

### Authentication (450–499)
| ID | Page | Status |
|----|------|--------|
| AIX-450 | Sign In | ✅ |
| AIX-451 | Sign Up | ✅ |
| AIX-452 | Reset Password | ✅ |
| AIX-453 | Two Step Verification | ✅ |

### Errors / system (500–549)
| ID | Page | Status |
|----|------|--------|
| AIX-500 | 404 | ✅ |
| AIX-501 | 500 | ✅ |
| AIX-502 | 503 | ✅ |
| AIX-503 | Coming Soon | ✅ |
| AIX-504 | Maintenance | ✅ |
| AIX-505 | Success | ✅ |

### Layout variants (550–599)
| ID | Page | Status |
|----|------|--------|
| AIX-550 | Layout One | ✅ |
| AIX-551 | Layout Two | ✅ |
| AIX-552 | Layout Three | ✅ |
| AIX-553 | Layout Four | ✅ |
| AIX-554 | Layout Five | ✅ |
| AIX-555 | Layout Six | ✅ |

---

## 4. Reusable primitive catalog (LIB-)

Generic, prop-driven components — the actual reusable payload of this theme.

| ID | Primitive | Path |
|----|-----------|------|
| LIB-DATATABLE | `DataTableOne<T>` — search/sort/paginate | `components/tables/DataTable/DataTableOne.tsx` |
| LIB-TABS | `Tabs` — underline / pill | `components/ui/tabs/Tabs.tsx` |
| LIB-BADGE | `Badge` | `components/ui/badge/Badge.tsx` |
| LIB-BUTTON | `Button` | `components/ui/button/Button.tsx` |
| LIB-CARD | `ComponentCard` | `components/common/ComponentCard.tsx` |
| LIB-TABLE | `Table` primitives | `components/ui/table/index.tsx` |
| LIB-MODAL | `Modal` | `components/ui/modal/index.tsx` |
| LIB-BREADCRUMB | `Breadcrumb` — chevron/slash, icons | `components/ui/breadcrumb/Breadcrumb.tsx` |
| LIB-BUTTONGROUP | `ButtonGroup` — segmented control | `components/ui/button-group/ButtonGroup.tsx` |
| LIB-CAROUSEL | `Carousel` — swiper wrapper | `components/ui/carousel/Carousel.tsx` |
| LIB-LIST | `List` — ul/ol/icon/check | `components/ui/list/List.tsx` |
| LIB-NOTIFICATION | `Notification` — toast, 4 variants | `components/ui/notification/Notification.tsx` |
| LIB-PAGINATION | `Pagination` — standalone pager | `components/ui/pagination/Pagination.tsx` |
| LIB-POPOVER | `Popover` — 4 placements | `components/ui/popover/Popover.tsx` |
| LIB-PROGRESS | `ProgressBar` — sizes/colors/label | `components/ui/progress/ProgressBar.tsx` |
| LIB-RIBBON | `Ribbon` — corner/rounded | `components/ui/ribbon/Ribbon.tsx` |
| LIB-SPINNER | `Spinner` — ring/dots | `components/ui/spinner/Spinner.tsx` |
| LIB-TOOLTIP | `Tooltip` — 4 placements | `components/ui/tooltip/Tooltip.tsx` |
| LIB-ACCORDION | `Accordion` — single/multi expand | `components/ui/accordion/Accordion.tsx` |
| LIB-AGENTAVATAR | `AgentAvatar` + `AGENT_META` — 6 agent identities | `components/aix/AgentAvatar.tsx` |
| LIB-STATCARD | `StatCard` — KPI + delta pill | `components/aix/StatCard.tsx` |
| LIB-AGENTHERO | `AgentHero` — agent dashboard hero | `components/aix/dashboards/AgentHero.tsx` |
| LIB-PROMPTCOMPOSER | `PromptComposer` — AI prompt input | `components/ai/PromptComposer.tsx` |
| LIB-BACKDROP | `LiquidBackdrop` — fixed ambient gradient canvas (warm blob aurora) | `components/common/LiquidBackdrop.tsx` |

**Liquid-glass utilities** (in `globals.css`, chrome-only): `.glass-surface`
(sidebar/header/toolbars), `.glass-float` (modals), `.glass-popover`
(menus/dropdowns/tooltips). Content cards never use glass.

_(catalog grows as primitives are added)_

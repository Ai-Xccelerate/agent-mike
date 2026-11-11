import { describe, expect, it } from "vitest";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { publicWorkerIdentity } from "@/lib/public-worker-identity";
import { DEFAULT_WIDGET_APPEARANCE, resolveWidgetAppearance, widgetAppearanceSchema } from "@/lib/widget-appearance";
import { applyWorkerPatch } from "@/lib/worker-settings";
import {
  applyWidgetLook,
  brandScale,
  contrastWithWhite,
  DEFAULT_WIDGET_APPEARANCE as FRONTEND_DEFAULTS,
  resolveWidgetAppearance as resolveInBrowser,
} from "../frontend/src/lib/widget-appearance";

const EAP_CYAN = "#09B8EB";

describe("the stored appearance", () => {
  it("is the defaults when nothing is stored, and ignores what does not validate", () => {
    expect(resolveWidgetAppearance(null)).toEqual(DEFAULT_WIDGET_APPEARANCE);
    expect(resolveWidgetAppearance({ theme: "neon", corners: "soft" })).toEqual(DEFAULT_WIDGET_APPEARANCE);
    expect(resolveWidgetAppearance({ corners: "soft", panelTitle: "  EAP Expert Support " })).toMatchObject({
      corners: "soft",
      theme: "light",
      panelTitle: "EAP Expert Support",
    });
  });

  it("is light by default, so the chat does not follow a manager's saved console theme", () => {
    expect(DEFAULT_WIDGET_APPEARANCE.theme).toBe("light");
  });

  it("turns an empty title into the default, and refuses one that is too long", () => {
    const base = { theme: "light", corners: "rounded", launcherIcon: "chat", panelSubtitle: null } as const;
    expect(widgetAppearanceSchema.parse({ ...base, panelTitle: "" }).panelTitle).toBeNull();
    expect(widgetAppearanceSchema.safeParse({ ...base, panelTitle: "x".repeat(41) }).success).toBe(false);
  });

  it("is saved with the worker, returned to a public widget, and rejected when it is not valid", async () => {
    const org = `org-${crypto.randomUUID()}`;
    await ensureOrganization(org, "Appearance org");
    await getOrCreateProfile(org);

    const saved = await applyWorkerPatch(org, {
      accentColor: EAP_CYAN,
      widgetAppearance: { theme: "auto", corners: "soft", launcherIcon: "headset", panelTitle: "EAP Expert Support", panelSubtitle: "" },
    });
    expect(saved.ok).toBe(true);

    const profile = await getOrCreateProfile(org);
    expect(profile.accentColor).toBe(EAP_CYAN);
    const seenByWidget = publicWorkerIdentity(profile);
    expect(seenByWidget.accentColor).toBe(EAP_CYAN);
    expect(seenByWidget.widgetAppearance).toEqual({ theme: "auto", corners: "soft", launcherIcon: "headset", panelTitle: "EAP Expert Support", panelSubtitle: null });

    const badColour = await applyWorkerPatch(org, { accentColor: "cyan" });
    expect(badColour).toMatchObject({ ok: false, status: 422 });
    const badTheme = await applyWorkerPatch(org, { widgetAppearance: { theme: "neon", corners: "soft", launcherIcon: "chat", panelTitle: null, panelSubtitle: null } });
    expect(badTheme).toMatchObject({ ok: false, status: 422 });

    const reset = await applyWorkerPatch(org, { widgetAppearance: null });
    expect(reset.ok).toBe(true);
    expect(publicWorkerIdentity(await getOrCreateProfile(org)).widgetAppearance).toEqual(DEFAULT_WIDGET_APPEARANCE);
  });
});

describe("the colour the chat is drawn in", () => {
  it("builds the whole scale from one colour, with 500 as the colour itself", () => {
    const scale = brandScale(EAP_CYAN)!;
    expect(scale["--color-brand-500"]).toBe("#09b8eb");
    expect(Object.keys(scale)).toHaveLength(12);
    expect(scale["--color-brand-25"]).not.toBe(scale["--color-brand-950"]);
    expect(scale["--color-brand-50"]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("makes lighter steps lighter and darker steps darker", () => {
    const channelSum = (hex: string) => [1, 3, 5].reduce((sum, at) => sum + parseInt(hex.slice(at, at + 2), 16), 0);
    const scale = brandScale(EAP_CYAN)!;
    const order = ["25", "100", "300", "500", "700", "950"].map((step) => channelSum(scale[`--color-brand-${step}`]));
    expect([...order].sort((a, b) => b - a)).toEqual(order);
  });

  it("gives nothing for a value that is not a #RRGGBB colour", () => {
    expect(brandScale("cyan")).toBeNull();
    expect(brandScale("#09B8E")).toBeNull();
    expect(brandScale("#09B8EBFF")).toBeNull();
  });

  it("measures how readable white text is on it, and flags EAP's own cyan as below the 3 to 1 floor", () => {
    expect(contrastWithWhite("#000000")).toBe(21);
    expect(contrastWithWhite("#FFFFFF")).toBe(1);
    expect(contrastWithWhite("#364352")!).toBeGreaterThan(9);
    expect(contrastWithWhite(EAP_CYAN)!).toBeLessThan(3);
    expect(contrastWithWhite("nope")).toBeNull();
  });

  it("agrees with the API on the defaults", () => {
    expect(FRONTEND_DEFAULTS).toEqual(DEFAULT_WIDGET_APPEARANCE);
    expect(resolveInBrowser({ launcherIcon: "message" }).launcherIcon).toBe("message");
    expect(resolveInBrowser("junk")).toEqual(DEFAULT_WIDGET_APPEARANCE);
  });
});

describe("putting the look on the page", () => {
  function fakeRoot(startsDark = false) {
    const style = new Map<string, string>();
    const dark = { on: startsDark };
    return {
      style: { setProperty: (name: string, value: string) => void style.set(name, value), removeProperty: (name: string) => void style.delete(name) },
      classList: { contains: () => dark.on, toggle: (_name: string, force: boolean) => void (dark.on = force) },
      seen: { style, dark },
    };
  }
  const look = (overrides: Partial<typeof DEFAULT_WIDGET_APPEARANCE> = {}) => ({ accentColor: EAP_CYAN, appearance: { ...DEFAULT_WIDGET_APPEARANCE, ...overrides } });

  it("sets the brand scale, leaves the app's own corners for 'rounded', and takes it all off again", () => {
    const root = fakeRoot();
    const remove = applyWidgetLook(root as unknown as HTMLElement, look(), false);
    expect(root.seen.style.get("--color-brand-500")).toBe("#09b8eb");
    expect(root.seen.style.has("--radius-lg")).toBe(false);
    remove();
    expect(root.seen.style.size).toBe(0);
  });

  it("squares or softens the corners on request", () => {
    const square = fakeRoot();
    applyWidgetLook(square as unknown as HTMLElement, look({ corners: "square" }), false);
    expect(square.seen.style.get("--radius-2xl")).toBe("0px");
    const soft = fakeRoot();
    applyWidgetLook(soft as unknown as HTMLElement, look({ corners: "soft" }), false);
    expect(soft.seen.style.get("--radius-2xl")).toBe("22px");
  });

  it("forces light even when the visitor's device is dark, and follows the device only for 'auto'", () => {
    const light = fakeRoot(true);
    applyWidgetLook(light as unknown as HTMLElement, look({ theme: "light" }), true);
    expect(light.seen.dark.on).toBe(false);

    const autoDark = fakeRoot();
    applyWidgetLook(autoDark as unknown as HTMLElement, look({ theme: "auto" }), true);
    expect(autoDark.seen.dark.on).toBe(true);

    const autoLight = fakeRoot(true);
    applyWidgetLook(autoLight as unknown as HTMLElement, look({ theme: "auto" }), false);
    expect(autoLight.seen.dark.on).toBe(false);

    const dark = fakeRoot();
    applyWidgetLook(dark as unknown as HTMLElement, look({ theme: "dark" }), false);
    expect(dark.seen.dark.on).toBe(true);
  });

  it("restores the theme it found when it is taken off", () => {
    const root = fakeRoot(true);
    const remove = applyWidgetLook(root as unknown as HTMLElement, look({ theme: "light" }), false);
    expect(root.seen.dark.on).toBe(false);
    remove();
    expect(root.seen.dark.on).toBe(true);
  });
});


/**
 * Customizable dashboard layout (U-02). The member can reorder and show/hide the
 * basic-forecast widgets; their layout persists per device. New widgets added in
 * a release are appended automatically so nobody's layout goes stale.
 */
export const DASHBOARD_WIDGETS = [
  "hero", "alerts", "stats", "today", "sevenDay", "sunMoon", "windCompass",
  "swti", "tempChart", "precipChart", "nwsOffice",
] as const;
export type WidgetId = (typeof DASHBOARD_WIDGETS)[number];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  hero: "Current conditions",
  alerts: "Active alerts",
  stats: "Conditions grid",
  today: "Today's high & low",
  sevenDay: "7-day forecast",
  sunMoon: "Sunrise & sunset",
  windCompass: "Wind compass",
  swti: "Storm Threat Index",
  tempChart: "Temperature trend",
  precipChart: "Precip probability",
  nwsOffice: "NWS office info",
};

export interface DashboardLayout { order: WidgetId[]; hidden: WidgetId[] }
const STORAGE = "stormsync_dashboard_v1";

export function getLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const v = JSON.parse(raw) as Partial<DashboardLayout>;
      const order = (v.order ?? []).filter((w): w is WidgetId => (DASHBOARD_WIDGETS as readonly string[]).includes(w));
      const hidden = (v.hidden ?? []).filter((w): w is WidgetId => (DASHBOARD_WIDGETS as readonly string[]).includes(w));
      // Append any widgets missing from the saved order (e.g. new in this release).
      for (const w of DASHBOARD_WIDGETS) if (!order.includes(w)) order.push(w);
      return { order, hidden };
    }
  } catch { /* ignore */ }
  return { order: [...DASHBOARD_WIDGETS], hidden: [] };
}

export function saveLayout(layout: DashboardLayout): void {
  try { localStorage.setItem(STORAGE, JSON.stringify(layout)); } catch { /* ignore */ }
}

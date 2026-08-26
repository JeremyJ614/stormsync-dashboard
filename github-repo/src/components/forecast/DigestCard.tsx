/**
 * The Daily Brief card.
 *
 * Same content the push and email digest carry, shown in the app so a member
 * can read it without waiting for a notification, and can see exactly what they
 * are signing up for before they turn it on. That last part is why it comes
 * first in the module rather than being buried in settings: nobody opts into a
 * digest they have never seen.
 *
 * Sections and delivery hour are the member's own, edited right here.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sun, Settings2, Check, Loader2, Clock, GripVertical, Bell, X,
} from "lucide-react";
import {
  buildDigest, getDigestPrefs, saveDigestPrefs, hourLabel,
  SECTIONS, DEFAULT_PREFS, type SectionKey,
} from "../../lib/digest";
import { TTL } from "../../lib/queryClient";
import { useCalm } from "../../lib/calm";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../../lib/royal";
import { Panel } from "../ModuleShell";

export function DigestCard({ lat, lon, place }: { lat: number; lon: number; place: string }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const { calm } = useCalm(lat, lon);
  const still = prefersReducedMotion() || calm;

  const prefsQ = useQuery({
    queryKey: ["digest-prefs"],
    queryFn: getDigestPrefs,
    staleTime: TTL.config,
  });
  const prefs = prefsQ.data ?? DEFAULT_PREFS;

  const digestQ = useQuery({
    queryKey: ["digest", lat.toFixed(2), lon.toFixed(2), prefs.sections.join(",")],
    queryFn: () => buildDigest(lat, lon, prefs.sections),
    enabled: prefsQ.isSuccess,
    staleTime: TTL.normal,
  });

  // saveDigestPrefs reports failure by returning { ok: false } rather than
  // throwing, so onSuccess fires either way. Closing the editor on a failed save
  // was how a real bug stayed invisible: the panel shut, nothing had changed,
  // and there was nothing on screen to say why.
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: saveDigestPrefs,
    onSuccess: (r) => {
      if (!r.ok) { setSaveError(r.error ?? "Could not save your brief settings."); return; }
      setSaveError(null);
      void qc.invalidateQueries({ queryKey: ["digest-prefs"] });
      void qc.invalidateQueries({ queryKey: ["digest"] });
      setEditing(false);
    },
    onError: (e) => setSaveError(e instanceof Error ? e.message : "Could not save your brief settings."),
  });

  const sections = digestQ.data ?? [];
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "This morning" : h < 18 ? "This afternoon" : "Tonight";
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden p-5"
           style={{
             background: `linear-gradient(150deg, ${ROYAL.gold}14, hsl(var(--card)))`,
             border: `1px solid ${ROYAL.gold}3a`,
           }}>
        <div className="flex items-start gap-3 flex-wrap">
          <span className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                style={{ background: `${ROYAL.gold}1f`, border: `1px solid ${ROYAL.gold}55` }}>
            <Sun className="w-5 h-5" style={{ color: ROYAL.gold }} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.28em] font-semibold"
                 style={{ color: ROYAL.dim }}>
              Daily Brief · {place}
            </div>
            <h2 className="text-xl font-bold leading-tight"
                style={{ fontFamily: HEADING, color: ROYAL.text }}>
              {greeting}
            </h2>
          </div>
          <button onClick={() => setEditing((v) => !v)}
            className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
            <Settings2 className="w-3.5 h-3.5" /> Customise
          </button>
        </div>

        {digestQ.isLoading ? (
          <p className="mt-4 text-sm flex items-center gap-2" style={{ color: ROYAL.dim }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Putting your brief together…
          </p>
        ) : sections.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: ROYAL.dim }}>
            Nothing selected. Press Customise and pick what you want in it.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {sections.map((s, i) => (
              <motion.div
                key={s.key}
                initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: still ? 0 : i * 0.06, duration: 0.4, ease: EASE }}
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${s.tone ? `${s.tone}55` : ROYAL.hairline}`,
                }}
              >
                <div className="text-[10px] uppercase tracking-wider" style={{ color: ROYAL.dim }}>
                  {s.label}
                </div>
                <div className="text-lg font-bold leading-tight"
                     style={{ color: s.tone ?? ROYAL.text }}>
                  {s.value}
                </div>
                {s.detail && (
                  <div className="text-[11px] mt-0.5 leading-snug" style={{ color: ROYAL.dim }}>
                    {s.detail}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        <p className="mt-3 text-[11px] flex items-center gap-1.5" style={{ color: ROYAL.dim }}>
          <Bell className="w-3 h-3" />
          Sent to you each day at {hourLabel(prefs.hour)}, your time.
        </p>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={still ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="overflow-hidden"
          >
            <Editor
              prefs={prefs}
              busy={save.isPending}
              error={saveError}
              onCancel={() => { setSaveError(null); setEditing(false); }}
              onSave={(p) => save.mutate(p)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Editor({
  prefs, busy, error, onSave, onCancel,
}: {
  prefs: { hour: number; sections: SectionKey[] };
  busy: boolean;
  error: string | null;
  onSave: (p: { hour: number; sections: SectionKey[] }) => void;
  onCancel: () => void;
}) {
  const [hour, setHour] = useState(prefs.hour);
  const [picked, setPicked] = useState<SectionKey[]>(prefs.sections);

  // Order is meaningful — it is the order they appear in the brief — so
  // toggling on appends rather than slotting back into the catalogue order.
  const toggle = (k: SectionKey) =>
    setPicked((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  const move = (i: number, dir: -1 | 1) =>
    setPicked((cur) => {
      const next = [...cur];
      const j = i + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <Panel title="What's in your brief, and when">
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg px-3 py-2 text-[12px]"
               style={{ background: "rgba(255,77,85,0.1)", border: "1px solid rgba(255,77,85,0.35)", color: "#ffb3b6" }}>
            {error}
          </div>
        )}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider mb-2" style={{ color: ROYAL.dim }}>
            Sections
          </h4>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {SECTIONS.map((s) => {
              const on = picked.includes(s.key);
              return (
                <button key={s.key} onClick={() => toggle(s.key)} title={s.blurb}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 transition-colors"
                  style={on
                    ? { background: `${ROYAL.gold}22`, borderColor: `${ROYAL.gold}77`, color: ROYAL.gold }
                    : { background: "rgba(255,255,255,0.03)", borderColor: ROYAL.hairline, color: ROYAL.dim }}>
                  {on && <Check className="w-3 h-3" />}{s.label}
                </button>
              );
            })}
          </div>

          {picked.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px]" style={{ color: ROYAL.dim }}>Order they appear in:</p>
              {picked.map((k, i) => {
                const meta = SECTIONS.find((s) => s.key === k)!;
                return (
                  <div key={k} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5"
                       style={{ background: "rgba(255,255,255,0.03)" }}>
                    <GripVertical className="w-3 h-3 shrink-0" style={{ color: ROYAL.dim }} />
                    <span className="flex-1 min-w-0 truncate" style={{ color: ROYAL.text }}>{meta.label}</span>
                    <span className="text-[10px] hidden sm:inline truncate" style={{ color: ROYAL.dim }}>{meta.blurb}</span>
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                      className="p-0.5 disabled:opacity-25" style={{ color: ROYAL.dim }}>▲</button>
                    <button onClick={() => move(i, 1)} disabled={i === picked.length - 1} aria-label="Move down"
                      className="p-0.5 disabled:opacity-25" style={{ color: ROYAL.dim }}>▼</button>
                    <button onClick={() => toggle(k)} aria-label="Remove"
                      className="p-0.5" style={{ color: ROYAL.dim }}><X className="w-3 h-3" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-[11px] uppercase tracking-wider mb-2 flex items-center gap-1.5"
              style={{ color: ROYAL.dim }}>
            <Clock className="w-3 h-3" /> Delivered at
          </h4>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 24 }).map((_, h) => {
              const on = hour === h;
              return (
                <button key={h} onClick={() => setHour(h)}
                  className="px-2 py-1 rounded-md text-[11px] tabular-nums border transition-colors"
                  style={on
                    ? { background: `${ROYAL.gold}22`, borderColor: `${ROYAL.gold}77`, color: ROYAL.gold }
                    : { background: "rgba(255,255,255,0.03)", borderColor: ROYAL.hairline, color: ROYAL.dim }}>
                  {hourLabel(h)}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: ROYAL.dim }}>
            Your local time, wherever you are.
          </p>
        </div>

        <div className="flex gap-2">
          <button onClick={() => onSave({ hour, sections: picked })} disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save
          </button>
          <button onClick={onCancel}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "rgba(255,255,255,0.04)", color: ROYAL.dim }}>
            Cancel
          </button>
        </div>
      </div>
    </Panel>
  );
}

export default DigestCard;

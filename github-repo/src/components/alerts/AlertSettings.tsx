/**
 * A member's own alert settings.
 *
 * Two halves. The ladder shows what they hold and what more would cost. Below
 * it, the settings that only matter once you hold something: where alerts are
 * scoped to, and how we reach you.
 *
 * The settings half is gated on what they actually have, and says why rather
 * than hiding: a contact field with no level behind it is a form that does
 * nothing, and a member who fills one in and then hears nothing has been
 * misled by the interface.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BellRing, Check, Loader2, Mail, MessageSquare, MapPin, Globe2, Layers,
  Phone, KeyRound, Copy, ShieldCheck, Clock, X,
} from "lucide-react";
import {
  ALERT_LEVELS, SCOPE_LABEL, SCOPE_BLURB, money,
  fetchAlertPrices, fetchMyLevels, fetchAlertPrefs, saveAlertPrefs,
  fetchMyEmergencyPin, requestAlertLevel, withdrawAlertRequest, fetchMyAlertRequests,
  DEFAULT_ALERT_PREFS, type AlertScope, type AlertPrefs,
} from "../../lib/alerts";
import { supabase } from "../../lib/supabase";
import { TTL } from "../../lib/queryClient";
import { useAuth } from "../../hooks/useAuth";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../../lib/royal";
import { AlertLadder } from "./AlertLadder";

const SCOPE_ICON: Record<AlertScope, typeof Globe2> = {
  state: Globe2, location: MapPin, multiple: Layers, all: BellRing,
};

interface SavedLocation { id: string; name: string; lat: number; lon: number; is_primary: boolean }

async function fetchSavedLocations(): Promise<SavedLocation[]> {
  const { data } = await supabase
    .from("saved_locations").select("id,name,lat,lon,is_primary").order("is_primary", { ascending: false });
  return (data ?? []) as SavedLocation[];
}

export function AlertSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const still = prefersReducedMotion();
  const [draft, setDraft] = useState<AlertPrefs | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const pricesQ = useQuery({ queryKey: ["alert-prices"], queryFn: fetchAlertPrices, staleTime: TTL.config });
  const levelsQ = useQuery({ queryKey: ["my-alert-levels"], queryFn: fetchMyLevels, staleTime: TTL.config });
  const prefsQ = useQuery({ queryKey: ["alert-prefs"], queryFn: fetchAlertPrefs, staleTime: TTL.config });
  const locsQ = useQuery({ queryKey: ["saved-locations"], queryFn: fetchSavedLocations, staleTime: TTL.config });
  const reqsQ = useQuery({ queryKey: ["my-alert-requests"], queryFn: fetchMyAlertRequests, staleTime: TTL.quick });

  const held = levelsQ.data ?? [];
  const top = held.length ? Math.max(...held.map((h) => h.level)) : 0;
  const prefs = draft ?? prefsQ.data ?? DEFAULT_ALERT_PREFS;
  const dirty = draft !== null;

  // Level 4 is partly defined as "and they receive the PIN", so it is fetched
  // only when they hold it. The RPC returns null either way, but not asking at
  // all keeps the network quiet for everyone else.
  const pinQ = useQuery({
    queryKey: ["my-emergency-pin"],
    queryFn: fetchMyEmergencyPin,
    enabled: top >= 4,
    staleTime: TTL.config,
  });

  const save = useMutation({
    mutationFn: saveAlertPrefs,
    onSuccess: (r) => {
      if (!r.ok) { setFlash(r.error ?? "Could not save."); return; }
      setDraft(null); setFlash("Saved.");
      void qc.invalidateQueries({ queryKey: ["alert-prefs"] });
      setTimeout(() => setFlash(null), 2200);
    },
  });

  const ask = useMutation({
    mutationFn: requestAlertLevel,
    onSuccess: (r) => {
      setFlash(
        r === "requested" ? "Request sent. We will confirm and set it up."
        : r === "already_held" ? "You already have that one."
        : r === "not_for_sale" ? "That level is not on sale at your tier yet."
        : "Could not send that request.",
      );
      void qc.invalidateQueries({ queryKey: ["my-alert-requests"] });
      setTimeout(() => setFlash(null), 3500);
    },
  });

  const withdraw = useMutation({
    mutationFn: withdrawAlertRequest,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["my-alert-requests"] }),
  });

  const set = (patch: Partial<AlertPrefs>) => setDraft({ ...prefs, ...patch });
  const locs = locsQ.data ?? [];
  const openRequests = reqsQ.data ?? [];

  const canScope = top >= 2;
  const canContact = top >= 3;
  const canDirect = top >= 5;

  const scopeSummary = useMemo(() => {
    if (prefs.scope === "multiple") {
      const n = prefs.locationIds.length;
      return n === 0 ? "No locations picked yet" : `${n} location${n === 1 ? "" : "s"}`;
    }
    if (prefs.scope === "location") {
      const l = locs.find((x) => x.id === prefs.locationIds[0]) ?? locs.find((x) => x.is_primary);
      return l?.name ?? "No location picked yet";
    }
    return SCOPE_LABEL[prefs.scope];
  }, [prefs.scope, prefs.locationIds, locs]);

  if (pricesQ.isLoading || levelsQ.isLoading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-sm" style={{ color: ROYAL.dim }}>
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your alerts…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl px-3.5 py-2.5 text-sm"
            style={{ background: `${ROYAL.gold}18`, border: `1px solid ${ROYAL.gold}44`, color: ROYAL.text }}>
            {flash}
          </motion.div>
        )}
      </AnimatePresence>

      {openRequests.length > 0 && (
        <div className="rounded-xl px-3.5 py-3"
             style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}` }}>
          <div className="text-[11px] uppercase tracking-[0.24em] font-bold mb-2 flex items-center gap-1.5"
               style={{ color: ROYAL.gold }}>
            <Clock className="w-3.5 h-3.5" /> Waiting on us
          </div>
          <div className="space-y-1.5">
            {openRequests.map((r) => {
              const def = ALERT_LEVELS.find((l) => l.level === r.level)!;
              return (
                <div key={r.level} className="flex items-center gap-2 text-sm">
                  <span className="font-semibold" style={{ color: def.color }}>{def.name}</span>
                  {r.quoted_price != null && (
                    <span style={{ color: ROYAL.dim }}>at {money(r.quoted_price)}/mo</span>
                  )}
                  <button onClick={() => withdraw.mutate(r.level)}
                          className="ml-auto p-1 rounded" style={{ color: ROYAL.dim }} aria-label="Withdraw request">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] mt-2" style={{ color: ROYAL.dim }}>
            We confirm these by hand and add them to your next invoice, so nothing is charged until we have.
          </p>
        </div>
      )}

      <section>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5"
            style={{ fontFamily: HEADING, color: ROYAL.text }}>
          <BellRing className="w-4 h-4" style={{ color: ROYAL.gold }} /> Your alert levels
        </h3>
        <AlertLadder
          tier={user?.tier ?? 1}
          prices={pricesQ.data ?? []}
          held={held}
          still={still}
          onAdd={(level) => ask.mutate(level)}
        />
      </section>

      {/* ── the PIN, for the people entitled to it ─────────────────────────── */}
      {top >= 4 && pinQ.data && (
        <section className="rounded-2xl p-4"
                 style={{ background: "rgba(255,138,61,0.08)", border: "1px solid rgba(255,138,61,0.32)" }}>
          <div className="flex items-start gap-3">
            <KeyRound className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#ff8a3d" }} />
            <div className="min-w-0 flex-1">
              <h4 className="font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
                Your Emergency Contact PIN
              </h4>
              <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: ROYAL.dim }}>
                Opens the vault on the Contact page. Use it any time a day is getting to you, not only in an
                emergency. It comes with Outlook &amp; Vault and stays yours while you hold that level.
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <code className="px-3 py-1.5 rounded-lg text-lg font-black tracking-[0.4em] tabular-nums"
                      style={{ background: "rgba(0,0,0,0.35)", color: "#ff8a3d" }}>
                  {pinQ.data}
                </code>
                <button
                  onClick={() => { void navigator.clipboard?.writeText(pinQ.data!); setFlash("PIN copied."); setTimeout(() => setFlash(null), 1800); }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  style={{ background: "rgba(255,255,255,0.06)", color: ROYAL.dim }}>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── scope ──────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl overflow-hidden"
               style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}`, opacity: canScope ? 1 : 0.62 }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
          <h3 className="text-sm font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            What counts as "your" weather
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>
            {canScope
              ? `Applies to every level from Push Alerts up. Right now: ${scopeSummary}.`
              : "Push Alerts and above let you choose this. Until then, alerts cover your state."}
          </p>
        </div>

        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(SCOPE_LABEL) as AlertScope[]).map((s) => {
            const Icon = SCOPE_ICON[s];
            const on = prefs.scope === s;
            return (
              <button key={s} disabled={!canScope} onClick={() => set({ scope: s })}
                className="text-left rounded-xl px-3 py-2.5 flex items-start gap-2.5 transition-colors disabled:cursor-not-allowed"
                style={{
                  background: on ? `${ROYAL.gold}1c` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${on ? ROYAL.gold + "66" : ROYAL.hairline}`,
                }}>
                <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: on ? ROYAL.gold : ROYAL.dim }} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold" style={{ color: on ? ROYAL.gold : ROYAL.text }}>
                    {SCOPE_LABEL[s]}
                  </div>
                  <div className="text-[11px] leading-snug" style={{ color: ROYAL.dim }}>{SCOPE_BLURB[s]}</div>
                </div>
                {on && <Check className="w-4 h-4 ml-auto shrink-0" style={{ color: ROYAL.gold }} />}
              </button>
            );
          })}
        </div>

        {canScope && (prefs.scope === "location" || prefs.scope === "multiple") && (
          <div className="px-3 pb-3">
            {locs.length === 0 ? (
              <p className="text-[12px] px-1" style={{ color: ROYAL.dim }}>
                You have no saved locations yet. Save one from the search box at the top and it will appear here.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {locs.map((l) => {
                  const on = prefs.locationIds.includes(l.id);
                  return (
                    <button key={l.id}
                      onClick={() => {
                        if (prefs.scope === "location") { set({ locationIds: [l.id] }); return; }
                        set({ locationIds: on ? prefs.locationIds.filter((x) => x !== l.id) : [...prefs.locationIds, l.id] });
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"
                      style={on
                        ? { background: `${ROYAL.gold}22`, border: `1px solid ${ROYAL.gold}77`, color: ROYAL.gold }
                        : { background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
                      {on && <Check className="w-3 h-3" />}{l.name}{l.is_primary && " ★"}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── how we reach you ───────────────────────────────────────────────── */}
      <section className="rounded-2xl overflow-hidden"
               style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}`, opacity: canContact ? 1 : 0.62 }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
          <h3 className="text-sm font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>How we reach you</h3>
          <p className="text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>
            {canContact
              ? "Contact Alerts and above. Leave a field blank to turn that channel off."
              : "Contact Alerts adds email and text. These fields do nothing until you have that level, so they are left alone."}
          </p>
        </div>

        <div className="p-3 space-y-3">
          <Field
            icon={Mail} label="Email address" disabled={!canContact}
            value={prefs.email ?? ""} placeholder={user?.email ?? "you@example.com"}
            onChange={(v) => set({ email: v || null })}
            toggle={prefs.emailOptin} onToggle={(v) => set({ emailOptin: v })}
            toggleLabel="Send alerts here"
          />
          <Field
            icon={Phone} label="Mobile number" disabled={!canContact}
            value={prefs.phone ?? ""} placeholder="+1 555 555 5555"
            onChange={(v) => set({ phone: v || null })}
            toggle={prefs.textOptin} onToggle={(v) => set({ textOptin: v })}
            toggleLabel="Text me too"
          />

          {canDirect && (
            <div>
              <label className="text-[11px] uppercase tracking-wider flex items-center gap-1.5 mb-1.5"
                     style={{ color: "#ff4d55" }}>
                <ShieldCheck className="w-3.5 h-3.5" /> Direct line — how you would rather be reached
              </label>
              <textarea
                rows={2}
                value={prefs.directLineNote ?? ""}
                onChange={(e) => set({ directLineNote: e.target.value || null })}
                placeholder="Call rather than text after 9pm. Reach my partner if I do not answer."
                className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}
              />
              <p className="text-[11px] mt-1" style={{ color: ROYAL.dim }}>
                We read this before we call. Anything that helps us reach you quickly belongs here.
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center gap-2">
        <button
          onClick={() => save.mutate(prefs)}
          disabled={!dirty || save.isPending}
          className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-45"
          style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save alert settings
        </button>
        {dirty && (
          <button onClick={() => setDraft(null)} className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: "rgba(255,255,255,0.04)", color: ROYAL.dim }}>
            Discard
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  icon: Icon, label, value, placeholder, disabled, onChange, toggle, onToggle, toggleLabel,
}: {
  icon: typeof Mail; label: string; value: string; placeholder: string; disabled: boolean;
  onChange: (v: string) => void; toggle: boolean; onToggle: (v: boolean) => void; toggleLabel: string;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider flex items-center gap-1.5 mb-1.5"
             style={{ color: ROYAL.dim }}>
        <Icon className="w-3.5 h-3.5" /> {label}
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text" value={value} disabled={disabled} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-xl px-3 py-2 text-sm disabled:cursor-not-allowed"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}
        />
        <button
          type="button" disabled={disabled} onClick={() => onToggle(!toggle)}
          className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:cursor-not-allowed"
          style={toggle
            ? { background: `${ROYAL.gold}22`, border: `1px solid ${ROYAL.gold}66`, color: ROYAL.gold }
            : { background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
          {toggle ? <Check className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />} {toggleLabel}
        </button>
      </div>
    </div>
  );
}

export default AlertSettings;

/**
 * The member's side of the referral programme.
 *
 * Three things a referrer actually wants to know, in this order: what is my
 * code, where am I on the ladder, and what is the next rung worth. Everything
 * else — the terms, the fine print about when a referral counts — sits under
 * that rather than in front of it.
 *
 * When the programme is switched off the card renders nothing at all rather
 * than a greyed-out tease: an offer that is not running should not be on the
 * screen making a promise nobody is going to keep.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Share2, Copy, Check, Gift, Loader2, Ticket } from "lucide-react";
import { myReferralSummary, myReferralCode, redeemReferralCode } from "../lib/promos";
import { ROYAL, HEADING } from "../lib/royal";

export function ReferralCard() {
  const [copied, setCopied] = useState(false);
  const [entry, setEntry] = useState("");
  const [entryMsg, setEntryMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({ queryKey: ["referral-summary"], queryFn: myReferralSummary, staleTime: 60_000 });
  const s = q.data;

  // The code is minted on first ask rather than at signup, so nobody has a code
  // sitting in a table who never went looking for one.
  useEffect(() => {
    if (s?.active && s.ok && !s.code) void myReferralCode().then(() => q.refetch());
  }, [s?.active, s?.ok, s?.code, q]);

  if (!s?.ok || !s.active) return null;

  const nextRung = s.rungs.find((r) => r.rank === s.converted + 1) ?? s.rungs[s.rungs.length - 1];

  async function copy() {
    if (!s?.code) return;
    try { await navigator.clipboard.writeText(s.code); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { /* clipboard blocked — the code is on screen anyway */ }
  }

  async function useCode() {
    setBusy(true);
    setEntryMsg(null);
    const r = await redeemReferralCode(entry);
    setBusy(false);
    setEntryMsg(r.ok ? "Thanks — we have credited whoever sent you." : r.error ?? "That did not work.");
    if (r.ok) { setEntry(""); void q.refetch(); }
  }

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
        <Share2 className="w-4 h-4" style={{ color: ROYAL.gold }} />
        <h3 className="text-sm font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>Bring someone in</h3>
        <span className="ml-auto text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>
          {s.converted} joined · {s.pending} pending
        </span>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] mb-1.5" style={{ color: ROYAL.gold }}>Your code</div>
          <div className="flex items-center gap-2">
            <code className="px-3.5 py-2 rounded-xl text-2xl font-black tracking-[0.35em] tabular-nums"
                  style={{ background: "rgba(0,0,0,0.35)", color: ROYAL.gold }}>
              {s.code ?? "·····"}
            </code>
            <button onClick={copy} disabled={!s.code}
              className="px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.06)", color: ROYAL.dim }}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-[11.5px] mt-2 leading-relaxed" style={{ color: ROYAL.dim }}>
            They enter this when they join. It counts once they start paying — not at signup — so the rewards
            below are for people who actually stayed.
          </p>
        </div>

        {/* The ladder, with where they are on it. */}
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${ROYAL.hairline}` }}>
          {s.rungs.map((r) => {
            const done = s.converted >= r.rank;
            const next = nextRung?.rank === r.rank && !done;
            return (
              <div key={r.rank} className="px-3 py-2 flex items-center gap-2.5 text-[12px]"
                   style={{
                     borderTop: r.rank === s.rungs[0]?.rank ? undefined : `1px solid ${ROYAL.hairline}`,
                     background: next ? "rgba(217,183,117,0.09)" : done ? "rgba(95,217,168,0.06)" : undefined,
                   }}>
                <span className="w-6 h-6 rounded-full grid place-items-center shrink-0 text-[11px] font-bold"
                      style={{
                        background: done ? "rgba(95,217,168,0.18)" : "rgba(217,183,117,0.14)",
                        color: done ? "#5fd9a8" : ROYAL.gold,
                      }}>
                  {done ? <Check className="w-3 h-3" /> : r.rank}
                </span>
                <span className="flex-1 min-w-0" style={{ color: done ? ROYAL.dim : ROYAL.text }}>{r.label}</span>
                {next && <span className="text-[10px] uppercase tracking-wider shrink-0" style={{ color: ROYAL.gold }}>Next</span>}
              </div>
            );
          })}
        </div>

        {s.rewards.length > 0 && (
          <div className="rounded-xl px-3 py-2.5 text-[12px] flex items-start gap-2"
               style={{ background: "rgba(95,217,168,0.08)", border: "1px solid rgba(95,217,168,0.3)", color: ROYAL.text }}>
            <Gift className="w-4 h-4 shrink-0 mt-px" style={{ color: "#5fd9a8" }} />
            <span>
              You have earned {s.rewards.length} reward{s.rewards.length === 1 ? "" : "s"}.
              {s.rewards.some((r) => !r.fulfilled)
                ? " We are setting the newest one up — it will land on your account shortly."
                : " All of them are on your account."}
            </span>
          </div>
        )}

        {/* Somebody sent them, and they never said so. */}
        {!s.referredBy && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] mb-1.5" style={{ color: ROYAL.gold }}>
              <Ticket className="w-3 h-3 inline mr-1" /> Were you sent by someone?
            </div>
            <div className="flex gap-2">
              <input value={entry} onChange={(e) => setEntry(e.target.value.replace(/\D/g, "").slice(0, 5))}
                     inputMode="numeric" placeholder="5-digit code"
                     className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm tracking-[0.3em] tabular-nums"
                     style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }} />
              <button onClick={useCode} disabled={entry.length !== 5 || busy}
                className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-45"
                style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Use it
              </button>
            </div>
            {entryMsg && <p className="text-[11.5px] mt-1.5" style={{ color: ROYAL.dim }}>{entryMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReferralCard;

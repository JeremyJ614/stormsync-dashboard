import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Loader2, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { isPushSupported, isSubscribed, subscribePush } from "../lib/push";
import { needsPushPrompt, recordPushPrompt } from "../lib/pushPrompt";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

/**
 * The one time we ask about push.
 *
 * An alerting product whose members are not reachable is not doing the thing it
 * is for, and until now the only way to turn push on was a card in the profile
 * that nobody opens unless they already know it is there — four devices across
 * thirty-three members. So every member is asked once, in front of the app,
 * with a real "no" that is honoured permanently.
 *
 * Three rules it follows, and each of them is the difference between a prompt
 * and a nuisance:
 *
 *   · It asks once per MEMBER, recorded on the server, not once per browser.
 *   · "No thanks" is final. Nothing here asks again, ever; the profile card is
 *     still there for anybody who changes their mind.
 *   · It does not appear at all where push cannot work — an iPhone browser that
 *     is not an installed web app, an unsupported browser — because asking a
 *     question that cannot be answered yes is asking for a no.
 *
 * It also waits: a modal thrown up during the first paint of the app reads as an
 * error dialog. A few seconds in, after the page has settled, it reads as an
 * offer.
 */
const APPEAR_AFTER_MS = 4000;

export function PushInvite() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const still = prefersReducedMotion();

  useEffect(() => {
    if (!user?.id || !isPushSupported()) return;
    let live = true;
    let timer = 0;

    void (async () => {
      // Already subscribed on this device: they have effectively answered yes,
      // so record it and never ask. This is what stops the four members who
      // already turned it on from being asked about something they have.
      if (await isSubscribed()) { void recordPushPrompt("yes"); return; }
      if (!(await needsPushPrompt())) return;
      if (!live) return;
      timer = window.setTimeout(() => { if (live) setShow(true); }, APPEAR_AFTER_MS);
    })();

    return () => { live = false; window.clearTimeout(timer); };
  }, [user?.id]);

  async function yes() {
    if (!user?.id) return;
    setBusy("yes"); setError(null);
    const r = await subscribePush(user.id);
    if (!r.ok) {
      // Do NOT record an answer here. Recording "yes" on a failure would mean
      // never asking again on a device where it could have worked.
      setError(r.error ?? "Could not turn notifications on.");
      setBusy(null);
      return;
    }
    await recordPushPrompt("yes");
    setBusy(null);
    setShow(false);
  }

  async function no() {
    setBusy("no");
    await recordPushPrompt("no");
    setBusy(null);
    setShow(false);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[200] grid place-items-center px-4"
          style={{ background: "rgba(4,4,12,0.72)", backdropFilter: "blur(6px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: still ? 0 : 0.25 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="push-invite-title"
        >
          <motion.div
            className="w-full max-w-sm rounded-2xl overflow-hidden relative"
            style={{
              background: `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
              border: `1px solid ${ROYAL.goldSoft}`,
              boxShadow: "0 30px 70px -30px #000",
            }}
            initial={still ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: still ? 0 : 0.34, ease: EASE }}
          >
            <button
              onClick={() => void no()}
              aria-label="No thanks"
              className="absolute top-3 right-3 p-1 rounded-md"
              style={{ color: ROYAL.dim }}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="px-5 pt-6 pb-5 text-center">
              <motion.span
                className="inline-grid place-items-center rounded-2xl mb-3"
                style={{
                  width: 52, height: 52,
                  background: "rgba(217,183,117,0.12)",
                  border: `1px solid ${ROYAL.goldSoft}`,
                  color: ROYAL.gold,
                }}
                animate={still ? {} : { rotate: [0, -12, 10, -6, 0] }}
                transition={still ? { duration: 0 } : { duration: 1.4, repeat: Infinity, repeatDelay: 3, ease: EASE }}
              >
                <BellRing className="w-6 h-6" />
              </motion.span>

              <h2 id="push-invite-title" className="text-[19px] font-bold leading-tight"
                  style={{ color: ROYAL.text, fontFamily: HEADING }}>
                Get warned on this device?
              </h2>
              <p className="text-[13px] mt-2 leading-relaxed" style={{ color: ROYAL.dim }}>
                Register this device and StormSync can put a warning on your lock screen the moment one is issued
                for a place you follow — even when the app is closed.
              </p>
              <p className="text-[11.5px] mt-2" style={{ color: ROYAL.dim, opacity: 0.85 }}>
                We only ask this once. You can change it any time in your profile.
              </p>

              {error && (
                <p className="text-[12px] mt-3" style={{ color: "#f3a3a5" }}>{error}</p>
              )}

              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={() => void yes()}
                  disabled={busy !== null}
                  className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #b8914a)`, color: "#0b0b12" }}
                >
                  {busy === "yes" ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                  Yes, register this device
                </button>
                <button
                  onClick={() => void no()}
                  disabled={busy !== null}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}
                >
                  {busy === "no" ? "…" : "No thanks"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PushInvite;

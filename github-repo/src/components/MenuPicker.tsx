import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useAuth, refreshProfile } from "../hooks/useAuth";
import {
  MENU_STYLES, MENU_META, saveMyMenuStyle, styleFor,
  subscribeMenuStyles, getMenuStylesSnapshot, getMenuStylesServerSnapshot,
  type MenuStyle,
} from "../lib/menuStyle";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

/**
 * Picking your own menu.
 *
 * There are fifteen of these and they are not variations — a radar scope, a
 * comic page, a neon street, a black hole. Which one is "right" is not a
 * question with an answer, so the admin setting is the DEFAULT and this is the
 * choice.
 *
 * SELECTING APPLIES IT IMMEDIATELY, and that is the whole design. No preview
 * pane can tell you what a menu is like — these are things you open, drill into
 * and come back out of. So picking one puts it live at once and the invitation
 * is to go and open it. Changing your mind costs one tap, and "follow the
 * default" is always there to get back to where you started.
 *
 * Used in two places with the same behaviour: the intro guide, where somebody
 * is choosing for the first time, and the profile, where they are changing
 * their mind. Same component, so the two can never drift apart.
 */
export function MenuPicker({ compact = false }: { compact?: boolean }) {
  const still = prefersReducedMotion();
  const { user } = useAuth();
  const cfg = useSyncExternalStore(
    subscribeMenuStyles, getMenuStylesSnapshot, getMenuStylesServerSnapshot);

  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /** What is on screen right now, whether chosen or inherited. */
  const live = styleFor(cfg, Boolean(user?.isAdmin), user?.menuStyle);
  const following = user?.menuStyle == null;
  const fallback = useMemo(
    () => styleFor(cfg, Boolean(user?.isAdmin), null), [cfg, user?.isAdmin]);

  const choose = useCallback(async (style: MenuStyle | null) => {
    if (!user) return;
    setBusy(style ?? "default"); setNote(null);
    const r = await saveMyMenuStyle(user.id, style);
    setBusy(null);
    if (!r.ok) { setNote(r.error ?? "Could not save that."); return; }
    // The menu is read off the user record, so it changes the moment this lands.
    await refreshProfile();
    setNote(style == null
      ? "Back to the app's default. Open the menu to see it."
      : `${MENU_META[style].label} it is. Open the menu to see it.`);
  }, [user]);

  if (!user) return null;

  return (
    <div className="space-y-2.5">
      {!compact && (
        <p className="text-[12px] leading-relaxed" style={{ color: ROYAL.dim }}>
          Fifteen ways to get around the app, and none of them is the right one — pick whichever you
          like. It changes the moment you tap it, so open the menu and have a look. You can change it
          again whenever you want, here or in your profile.
        </p>
      )}

      <button
        onClick={() => void choose(null)}
        disabled={busy !== null}
        className="w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2.5 disabled:opacity-60"
        style={{
          border: `1px solid ${following ? ROYAL.gold : ROYAL.hairline}`,
          background: following ? "rgba(217,183,117,0.08)" : "rgba(255,255,255,0.02)",
        }}
      >
        <span className="w-5 h-5 grid place-items-center rounded-full shrink-0"
              style={{ border: `1px solid ${following ? ROYAL.gold : ROYAL.hairline}` }}>
          {following && <Check className="w-3 h-3" style={{ color: ROYAL.gold }} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold" style={{ color: ROYAL.text }}>
            Whatever StormSync picks
          </span>
          <span className="block text-[11px]" style={{ color: ROYAL.dim }}>
            Currently {MENU_META[fallback].label}. Follows along if we change it.
          </span>
        </span>
        {busy === "default" && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
      </button>

      <div className={compact ? "space-y-1.5 max-h-[46vh] overflow-y-auto pr-0.5" : "space-y-1.5"}>
        {MENU_STYLES.map((s, i) => {
          const meta = MENU_META[s];
          const on = user.menuStyle === s;
          return (
            <motion.button
              key={s}
              onClick={() => void choose(s)}
              disabled={busy !== null}
              className="w-full text-left rounded-xl px-3 py-2.5 flex items-start gap-2.5 disabled:opacity-60"
              style={{
                border: `1px solid ${on ? ROYAL.gold : ROYAL.hairline}`,
                background: on ? "rgba(217,183,117,0.08)" : "rgba(255,255,255,0.02)",
              }}
              initial={still ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={still ? { duration: 0 } : { duration: 0.28, delay: Math.min(i, 8) * 0.028, ease: EASE }}
            >
              <span className="w-5 h-5 mt-0.5 grid place-items-center rounded-full shrink-0"
                    style={{ border: `1px solid ${on ? ROYAL.gold : ROYAL.hairline}` }}>
                {on && <Check className="w-3 h-3" style={{ color: ROYAL.gold }} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13px] font-semibold"
                        style={{ color: ROYAL.text, fontFamily: HEADING }}>
                    {meta.label}
                  </span>
                  {live === s && !on && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.1em]"
                          style={{ background: "rgba(217,183,117,0.15)", color: ROYAL.gold }}>
                      on now
                    </span>
                  )}
                </span>
                <span className="block text-[11px] mt-0.5 leading-snug" style={{ color: ROYAL.dim }}>
                  {meta.blurb}
                </span>
              </span>
              {busy === s && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 mt-1" />}
            </motion.button>
          );
        })}
      </div>

      {note && (
        <p className="text-[11.5px] flex items-center gap-1.5" style={{ color: ROYAL.gold }}>
          <Sparkles className="w-3 h-3 shrink-0" /> {note}
        </p>
      )}
    </div>
  );
}

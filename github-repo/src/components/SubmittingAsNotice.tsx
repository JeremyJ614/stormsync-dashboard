/**
 * "This will go in as them."
 *
 * The view-as banner says whose app you are looking at. It does not say what
 * happens if you press the button, and on the two interactive modules that is a
 * different and sharper question — a guess or a trivia answer submitted through
 * the lens is written against the member's account, counts toward their points,
 * and is logged against your name.
 *
 * So the modules that can write say so at the point of writing, rather than
 * leaving it to be inferred from a bar at the top of the screen.
 */
import { UserCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { ROYAL } from "../lib/royal";

export function SubmittingAsNotice({ what }: { what: string }) {
  const { viewAs } = useAuth();
  if (!viewAs) return null;
  return (
    <div
      role="note"
      className="rounded-xl px-3 py-2.5 flex items-start gap-2.5 text-[12px] leading-relaxed"
      style={{
        background: "rgba(217,183,117,0.10)",
        border: `1px solid ${ROYAL.goldSoft}`,
        color: ROYAL.text,
      }}
    >
      <UserCheck className="w-4 h-4 shrink-0 mt-px" style={{ color: ROYAL.gold }} />
      <span>
        {what} you submit here goes in as <strong>{viewAs.name}</strong> and counts toward their points.
        It is recorded in the audit log under your name.
      </span>
    </div>
  );
}

export default SubmittingAsNotice;

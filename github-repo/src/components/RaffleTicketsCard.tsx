import { useEffect, useMemo, useState } from "react";
import { Ticket, Trophy } from "lucide-react";
import {
  myTickets, listDraws, DRAWS, drawMeta, periodLabel,
  type TicketBalance, type RaffleDraw,
} from "../lib/raffles";
import { ROYAL, HEADING, prefersReducedMotion } from "../lib/royal";

/**
 * Your tickets.
 *
 * Drawn as actual tickets — a perforated stub with a punched edge — because a
 * number in a box does not feel like holding anything. Four pools, only the
 * ones you have entries in, with the rest named underneath so it is obvious
 * what else exists and how to get into it.
 *
 * The stack fans slightly and lifts on hover; more than three in a pool are
 * shown as a count on the top stub rather than as twenty overlapping cards.
 */
export function RaffleTicketsCard() {
  const [balances, setBalances] = useState<TicketBalance[] | null>(null);
  const [draws, setDraws] = useState<RaffleDraw[]>([]);
  const still = prefersReducedMotion();

  useEffect(() => {
    void myTickets().then(setBalances).catch(() => setBalances([]));
    void listDraws(5).then(setDraws).catch(() => setDraws([]));
  }, []);

  const held = useMemo(() => (balances ?? []).filter((b) => b.tickets > 0), [balances]);
  const total = held.reduce((t, b) => t + b.tickets, 0);
  const missing = DRAWS.filter((d) => !held.some((h) => h.drawType === d.key));

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Ticket className="w-4 h-4" style={{ color: ROYAL.gold }} /> Raffle tickets
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        {total === 0
          ? "You are not in a draw yet."
          : `${total} ticket${total === 1 ? "" : "s"} across ${held.length} draw${held.length === 1 ? "" : "s"}.`}
      </p>

      {held.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {held.map((b) => {
            const m = drawMeta(b.drawType);
            return (
              <div key={`${b.drawType}-${b.periodStart}`} className="relative" style={{ width: 132, height: 74 }}>
                {/* The fan behind the top stub — two hints of depth, no more. */}
                {b.tickets > 1 && <Stub tint={m.tint} offset={2} faded />}
                {b.tickets > 2 && <Stub tint={m.tint} offset={4} faded />}
                <Stub tint={m.tint} offset={0}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: m.tint }}>
                      {m.label}
                    </span>
                    <span
                      className="text-[19px] font-bold leading-none tabular-nums"
                      style={{ color: ROYAL.text, fontFamily: HEADING }}
                    >
                      {b.tickets}
                    </span>
                  </div>
                  <div className="text-[9.5px] mt-auto" style={{ color: ROYAL.dim }}>
                    {periodLabel(b.drawType, b.periodStart)}
                  </div>
                </Stub>
                {!still && (
                  <span
                    aria-hidden
                    className="sswx-badge-sheen pointer-events-none absolute inset-y-0 w-1/2 rounded-lg overflow-hidden"
                    style={{ background: "linear-gradient(105deg, transparent, rgba(255,255,255,0.18), transparent)" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {missing.length > 0 && (
        <p className="text-[10.5px] mt-3" style={{ color: ROYAL.dim }}>
          Not in{" "}
          {missing.map((d, i) => (
            <span key={d.key}>
              {i > 0 && (i === missing.length - 1 ? " or " : ", ")}
              <span style={{ color: d.tint }}>{d.label}</span>
            </span>
          ))}
          {" "}yet — {missing.some((d) => d.key === "blessed")
            ? "Blessed is given, never earned."
            : "entries come with your plan and from taking part."}
        </p>
      )}

      {draws.length > 0 && (
        <div className="mt-4 pt-3 border-t" style={{ borderColor: ROYAL.hairline }}>
          <div className="text-[9.5px] uppercase tracking-[0.18em] mb-1.5 flex items-center gap-1.5" style={{ color: ROYAL.dim }}>
            <Trophy className="w-3 h-3" /> Recent winners
          </div>
          <div className="space-y-1">
            {draws.map((d) => (
              <div key={d.id} className="flex items-baseline gap-2 text-[11.5px]">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: drawMeta(d.drawType).tint }} />
                <span className="truncate" style={{ color: ROYAL.text }}>{d.winnerName}</span>
                <span className="truncate flex-1" style={{ color: ROYAL.dim }}>{d.prizeLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A perforated stub. The notches are two circles punched out of the edges. */
function Stub({
  tint, offset, faded, children,
}: {
  tint: string; offset: number; faded?: boolean; children?: React.ReactNode;
}) {
  return (
    <div
      className="absolute rounded-lg px-2.5 py-2 flex flex-col"
      style={{
        inset: 0,
        transform: `translate(${offset}px, ${-offset}px) rotate(${offset * 0.9}deg)`,
        background: `linear-gradient(135deg, ${tint}22, rgba(10,10,22,0.92) 62%)`,
        border: `1px solid ${tint}55`,
        boxShadow: faded ? "none" : `0 4px 14px -6px rgba(0,0,0,0.9)`,
        opacity: faded ? 0.45 : 1,
        // The punch: two holes bitten out of the left and right edges.
        maskImage:
          "radial-gradient(circle 5px at 0 50%, transparent 99%, #000 100%)," +
          "radial-gradient(circle 5px at 100% 50%, transparent 99%, #000 100%)",
        maskComposite: "intersect",
        WebkitMaskImage:
          "radial-gradient(circle 5px at 0 50%, transparent 99%, #000 100%)," +
          "radial-gradient(circle 5px at 100% 50%, transparent 99%, #000 100%)",
        WebkitMaskComposite: "source-in",
      }}
    >
      {children}
    </div>
  );
}

export default RaffleTicketsCard;

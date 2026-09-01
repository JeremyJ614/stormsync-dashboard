/**
 * The old name for a badge.
 *
 * Badges are medallions now (see BadgeMedal). This keeps the old import path
 * and the old `size` vocabulary working, because the chip was rendered from
 * five places and none of them were wrong — only the thing they rendered was.
 */
import { BadgeMedal, type MedalSize } from "./BadgeMedal";
import type { BadgeDef } from "../hooks/useAuth";

export function BadgeChip({
  id, defs, size = "sm", showLabel,
}: {
  id: string;
  defs: BadgeDef[];
  size?: "sm" | "md" | MedalSize;
  showLabel?: boolean;
}) {
  return <BadgeMedal id={id} defs={defs} size={size as MedalSize} showLabel={showLabel} />;
}

export { BadgeMedal };
export default BadgeChip;

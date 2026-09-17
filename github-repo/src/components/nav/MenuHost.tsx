import type { MenuStyle } from "../../lib/menuStyle";
import type { MenuNav } from "./menus/useMenuNav";
import { CanvasPushMenu } from "./menus/CanvasPushMenu";
import { MercuryMenu } from "./menus/MercuryMenu";
import { VaultMenu } from "./menus/VaultMenu";
import { StrataMenu } from "./menus/StrataMenu";
import { SingularityMenu } from "./menus/SingularityMenu";
import { AuroraMenu } from "./menus/AuroraMenu";
import { OrigamiMenu } from "./menus/OrigamiMenu";
import { GeometricMenu } from "./menus/GeometricMenu";
import { NeonMenu } from "./menus/NeonMenu";
import { TessellateMenu } from "./menus/TessellateMenu";
import { KineticMenu } from "./menus/KineticMenu";
import { ElevatorMenu } from "./menus/ElevatorMenu";
import { ComicMenu } from "./menus/ComicMenu";
import { ApexMenu } from "./menus/ApexMenu";

/**
 * Picks the menu the admin chose. The nav state is created once by Layout and
 * handed down, because Canvas Push needs Layout to transform the app content
 * and a child cannot push its own ancestor.
 *
 * The switch is exhaustive over `MenuStyle`, so adding a style to the union
 * without wiring it here is a type error rather than a blank screen.
 */
export function MenuHost({ style, nav }: { style: MenuStyle; nav: MenuNav }) {
  switch (style) {
    case "push":        return <CanvasPushMenu nav={nav} />;
    case "strata":      return <StrataMenu nav={nav} />;
    case "mercury":     return <MercuryMenu nav={nav} />;
    case "vault":       return <VaultMenu nav={nav} />;
    case "singularity": return <SingularityMenu nav={nav} />;
    case "aurora":      return <AuroraMenu nav={nav} />;
    case "origami":     return <OrigamiMenu nav={nav} />;
    case "geometric":   return <GeometricMenu nav={nav} />;
    case "neon":        return <NeonMenu nav={nav} />;
    case "tessellate":  return <TessellateMenu nav={nav} />;
    case "kinetic":     return <KineticMenu nav={nav} />;
    case "elevator":    return <ElevatorMenu nav={nav} />;
    case "comic":       return <ComicMenu nav={nav} />;
    case "apex":        return <ApexMenu nav={nav} />;
    case "rail":        return null;   // the sidebar renders itself
  }
}

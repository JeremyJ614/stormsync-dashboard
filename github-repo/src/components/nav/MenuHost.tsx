import type { MenuStyle } from "../../lib/menuStyle";
import type { MenuNav } from "./menus/useMenuNav";
import { GooeyFabMenu } from "./menus/GooeyFabMenu";
import { CanvasPushMenu } from "./menus/CanvasPushMenu";
import { SolariMenu } from "./menus/SolariMenu";
import { SweepMenu } from "./menus/SweepMenu";
import { StrataMenu } from "./menus/StrataMenu";
import { DeckMenu } from "./menus/DeckMenu";
import { SingularityMenu } from "./menus/SingularityMenu";

/**
 * Picks the menu the member chose. The nav state is created once by Layout and
 * handed down, because Canvas Push needs Layout to transform the app content
 * and a child cannot push its own ancestor.
 */
export function MenuHost({ style, nav }: { style: MenuStyle; nav: MenuNav }) {
  switch (style) {
    case "gooey":       return <GooeyFabMenu nav={nav} />;
    case "push":        return <CanvasPushMenu nav={nav} />;
    case "singularity": return <SingularityMenu nav={nav} />;
    case "solari":      return <SolariMenu nav={nav} />;
    case "sweep":       return <SweepMenu nav={nav} />;
    case "strata":      return <StrataMenu nav={nav} />;
    case "deck":        return <DeckMenu nav={nav} />;
    case "rail":        return null;   // the sidebar renders itself
  }
}

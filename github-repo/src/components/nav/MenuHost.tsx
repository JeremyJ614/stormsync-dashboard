import type { MenuStyle } from "../../lib/menuStyle";
import type { MenuNav } from "./menus/useMenuNav";
import { CanvasPushMenu } from "./menus/CanvasPushMenu";
import { TessellateMenu } from "./menus/TessellateMenu";
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
    case "push":       return <CanvasPushMenu nav={nav} />;
    case "tessellate": return <TessellateMenu nav={nav} />;
    case "comic":      return <ComicMenu nav={nav} />;
    case "apex":       return <ApexMenu nav={nav} />;
  }
}

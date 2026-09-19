import type { MenuStyle } from "../../lib/menuStyle";
import type { MenuNav } from "./menus/useMenuNav";
import { CanvasPushMenu } from "./menus/CanvasPushMenu";
import { TessellateMenu } from "./menus/TessellateMenu";
import { ComicMenu } from "./menus/ComicMenu";
import { ApexMenu } from "./menus/ApexMenu";
import { AuroraSidebarMenu } from "./menus/lab/AuroraSidebarMenu";
import { StackedCardsMenu } from "./menus/lab/StackedCardsMenu";
import { FloatingGlassMenu } from "./menus/lab/FloatingGlassMenu";
import { TabbedMegaMenu } from "./menus/lab/TabbedMegaMenu";
import { BentoMegaMenu } from "./menus/lab/BentoMegaMenu";
import { DualPanePushMenu } from "./menus/lab/DualPanePushMenu";
import { TwoStagePushMenu } from "./menus/lab/TwoStagePushMenu";
import { ExclusiveRailMenu } from "./menus/lab/ExclusiveRailMenu";
import { LabelledStackMenu } from "./menus/lab/LabelledStackMenu";
import { MorphSheetMenu } from "./menus/lab/MorphSheetMenu";
import { SegmentedPillMenu } from "./menus/lab/SegmentedPillMenu";
import { CollapsingPillMenu } from "./menus/lab/CollapsingPillMenu";

/**
 * Picks the menu the admin chose. The nav state is created once by Layout and
 * handed down, because the push styles need Layout to transform the app content
 * and a child cannot push its own ancestor.
 *
 * The switch is exhaustive over `MenuStyle`, so adding a style to the union
 * without wiring it here is a type error rather than a blank screen.
 */
export function MenuHost({ style, nav }: { style: MenuStyle; nav: MenuNav }) {
  switch (style) {
    // Originals
    case "push":           return <CanvasPushMenu nav={nav} />;
    case "tessellate":     return <TessellateMenu nav={nav} />;
    case "comic":          return <ComicMenu nav={nav} />;
    case "apex":           return <ApexMenu nav={nav} />;
    // Portal Lab
    case "auroraSidebar":  return <AuroraSidebarMenu nav={nav} />;
    case "stackedCards":   return <StackedCardsMenu nav={nav} />;
    case "floatingGlass":  return <FloatingGlassMenu nav={nav} />;
    case "tabbedMega":     return <TabbedMegaMenu nav={nav} />;
    case "bentoMega":      return <BentoMegaMenu nav={nav} />;
    case "dualPush":       return <DualPanePushMenu nav={nav} />;
    case "twoStagePush":   return <TwoStagePushMenu nav={nav} />;
    case "railAccordion":  return <ExclusiveRailMenu nav={nav} />;
    case "labelledStack":  return <LabelledStackMenu nav={nav} />;
    case "morphSheet":     return <MorphSheetMenu nav={nav} />;
    case "segmentedPill":  return <SegmentedPillMenu nav={nav} />;
    case "collapsingPill": return <CollapsingPillMenu nav={nav} />;
  }
}

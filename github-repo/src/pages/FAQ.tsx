import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, ChevronDown, Mail, Phone } from "lucide-react";
import { Link } from "wouter";
import { HIDDEN_MODULES } from "../hooks/useAuth";
import { DEFAULT_FAQ } from "../lib/faqDefaults";
import { listFaq, listCategories, type FaqSection } from "../lib/faq";
import { JsonLd } from "../components/JsonLd";
import { faqSchema } from "../lib/seo";

interface UiEntry { id: string; title: string; moduleId?: string; sections: FaqSection[] }
interface UiCategory { id: string; name: string; entries: UiEntry[] }

export default function FAQ() {
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const { data: cats } = useQuery({ queryKey: ["faq-categories"], queryFn: listCategories, staleTime: 5 * 60 * 1000 });
  const { data: entries } = useQuery({ queryKey: ["faq-entries"], queryFn: listFaq, staleTime: 5 * 60 * 1000 });

  // Build the category → entries view, falling back to the shipped defaults when
  // the DB has no categories or no entries yet.
  const ui: UiCategory[] = useMemo(() => {
    const haveDb = (cats?.length ?? 0) > 0 && (entries?.length ?? 0) > 0;
    if (!haveDb) {
      return DEFAULT_FAQ.map((c, ci) => ({
        id: `def-${ci}`, name: c.name,
        entries: c.entries
          .filter((e) => !e.moduleId || !HIDDEN_MODULES.has(e.moduleId))
          .map((e, ei) => ({ id: `def-${ci}-${ei}`, title: e.title, moduleId: e.moduleId, sections: e.sections })),
      }));
    }
    return (cats ?? []).map((c) => ({
      id: c.id, name: c.name,
      entries: (entries ?? [])
        .filter((e) => e.categoryId === c.id && (!e.moduleId || !HIDDEN_MODULES.has(e.moduleId)))
        .map((e) => ({ id: e.id, title: e.title, moduleId: e.moduleId, sections: e.sections })),
    }));
  }, [cats, entries]);

  const visible = ui.filter((c) => c.entries.length > 0);
  const current = visible.find((c) => c.id === activeCat) ?? visible[0];

  /**
   * Every question on the page, as structured data.
   *
   * ALL of them, not just the open category — the answers live inside
   * accordions that are collapsed until somebody clicks, so anything reading
   * the rendered page sees sixty-one headings and no answers. This is the only
   * place the actual content is legible to a machine.
   *
   * To be plain about the payoff: Google restricted FAQ rich results to
   * government and health sites in 2023, so this will not put a dropdown under
   * the search result. It is still what Bing reads for the same feature, and
   * it is how an assistant answering "how does StormSync billing work" finds a
   * real answer instead of guessing one.
   */
  const schema = useMemo(() => {
    const qa = ui.flatMap((c) => c.entries.map((e) => ({
      q: e.title,
      a: e.sections.map((s) => [s.heading, s.body].filter(Boolean).join(": ")).join(" ").trim(),
    }))).filter((x) => x.q && x.a);
    return qa.length ? faqSchema(qa) : null;
  }, [ui]);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {schema && <JsonLd id="faq" data={schema} />}
      <div className="flex items-center gap-2">
        <HelpCircle className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-wide uppercase">Help &amp; FAQ</h1>
      </div>

      {visible.length > 1 && (
        <div className="flex flex-wrap gap-2 bg-card border border-border rounded-xl p-1.5">
          {visible.map((c) => (
            <button key={c.id} onClick={() => { setActiveCat(c.id); setOpen(null); }}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${current?.id === c.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              {c.name} <span className="text-xs opacity-70">({c.entries.length})</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {current?.entries.map((e) => {
          const isOpen = open === e.id;
          const lead = e.sections.find((s) => s.body)?.body ?? "";
          return (
            <div key={e.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : e.id)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-sm font-semibold">{e.title}</span>
                  {lead && <span className="text-xs text-muted-foreground hidden md:inline truncate">{lead.slice(0, 70)}{lead.length > 70 ? "…" : ""}</span>}
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-2.5 border-t border-border pt-3">
                  {e.sections.map((s, i) => (
                    <div key={i}>
                      {s.heading && <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{s.heading}</span>}
                      <p className={`text-sm text-muted-foreground leading-relaxed ${s.heading ? "mt-0.5 text-xs" : ""}`}>{s.body}</p>
                    </div>
                  ))}
                  {e.moduleId && e.moduleId.startsWith("/") && <Link href={e.moduleId} className="inline-block mt-1 text-xs text-primary hover:underline">Open {e.title} →</Link>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold">Still need help?</h3>
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2"><Mail className="w-3 h-3 text-primary" /> <Link href="/contact" className="hover:text-primary">Customer Service</Link> — billing, access and account matters, routed to SSWX Internal Affairs</div>
          <div className="flex items-center gap-2"><Phone className="w-3 h-3 text-red-400" /> <Link href="/contact" className="hover:text-primary">Emergency Storm Contact</Link> — Tier 4 only, PIN required</div>
        </div>
      </div>
    </div>
  );
}

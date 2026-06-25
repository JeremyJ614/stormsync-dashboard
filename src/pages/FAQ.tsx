import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, ChevronDown, Mail, Phone } from "lucide-react";
import { Link } from "wouter";
import { HIDDEN_MODULES } from "../hooks/useAuth";
import { DEFAULT_GENERAL, DEFAULT_MODULES, type FaqItem, type ModuleDoc } from "../lib/faqDefaults";
import { listFaq } from "../lib/faq";

export default function FAQ() {
  const [tab, setTab] = useState<"general" | "modules">("general");
  const [open, setOpen] = useState<string | null>(null);

  // Admin-editable content lives in `faq_entries` (P-16); fall back to the shipped
  // defaults whenever the table is empty so the FAQ is never blank.
  const { data: rows } = useQuery({ queryKey: ["faq-entries"], queryFn: listFaq, staleTime: 5 * 60 * 1000 });
  const dbGeneral = (rows ?? []).filter(r => r.kind === "general");
  const dbModules = (rows ?? []).filter(r => r.kind === "module");
  const general: FaqItem[] = dbGeneral.length
    ? dbGeneral.map(r => ({ q: r.question ?? "", a: r.answer ?? "" }))
    : DEFAULT_GENERAL;
  const modules: ModuleDoc[] = dbModules.length
    ? dbModules.map(r => ({ id: r.moduleId ?? "", label: r.label ?? "", tier: (r.tier ?? 1) as 1 | 2 | 3 | 4, desc: r.description ?? "", what: r.what ?? "", how: r.howto ?? "", tips: r.tips }))
    : DEFAULT_MODULES;

  // U-22: the Module Guide explains what each module/add-on does — it is NOT a
  // tier sales sheet, so no tier filter or T1–T4 badges here.
  const visibleModules = modules.filter(m => !HIDDEN_MODULES.has(m.id));

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <HelpCircle className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-wide uppercase">Help & FAQ</h1>
      </div>

      <div className="grid grid-cols-2 gap-2 bg-card border border-border rounded-xl p-1.5">
        <button onClick={() => setTab("general")} className={`py-2.5 rounded-lg text-sm font-semibold ${tab === "general" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>General FAQ</button>
        <button onClick={() => setTab("modules")} className={`py-2.5 rounded-lg text-sm font-semibold ${tab === "modules" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>Module Guide ({visibleModules.length})</button>
      </div>

      {tab === "general" && (
        <div className="space-y-2">
          {general.map((f, i) => {
            const key = `g-${i}`;
            const isOpen = open === key;
            return (
              <div key={key} className="bg-card border border-border rounded-xl overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : key)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                  <span className="text-sm font-semibold">{f.q}</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{f.a}</div>}
              </div>
            );
          })}
        </div>
      )}

      {tab === "modules" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Every module and add-on explained. What you can access depends on your plan — ask an admin to enable any you'd like.</p>
          <div className="space-y-2">
            {visibleModules.map(m => {
              const key = `m-${m.id}`;
              const isOpen = open === key;
              return (
                <div key={key} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button onClick={() => setOpen(isOpen ? null : key)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-sm font-semibold">{m.label}</span>
                      <span className="text-xs text-muted-foreground hidden md:inline truncate">{m.desc.slice(0, 70)}…</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-2 text-sm border-t border-border pt-3">
                      <p className="text-muted-foreground leading-relaxed">{m.desc}</p>
                      <div><span className="text-[10px] font-bold uppercase tracking-widest text-primary">What it does</span><p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.what}</p></div>
                      <div><span className="text-[10px] font-bold uppercase tracking-widest text-primary">How to use</span><p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.how}</p></div>
                      {m.tips && <div><span className="text-[10px] font-bold uppercase tracking-widest text-yellow-300">Pro tip</span><p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.tips}</p></div>}
                      {m.id.startsWith("/") && <Link href={m.id} className="inline-block mt-1 text-xs text-primary hover:underline">Open {m.label} →</Link>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold">Still need help?</h3>
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2"><Mail className="w-3 h-3 text-primary" /> <a href="mailto:customerservice@stormsync.media" className="hover:text-primary">customerservice@stormsync.media</a> — general support</div>
          <div className="flex items-center gap-2"><Phone className="w-3 h-3 text-red-400" /> <Link href="/contact" className="hover:text-primary">Emergency Storm Contact</Link> — Tier 4 only, PIN required</div>
        </div>
      </div>
    </div>
  );
}

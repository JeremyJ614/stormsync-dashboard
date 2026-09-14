/**
 * Help & FAQ.
 *
 * REDESIGNED. The old page was a row of category pills over sixty-one accordion
 * rows. Every question looked identical to every other one, the only way to find
 * anything was to guess its category and read down the list, and the answer
 * appeared by the row simply becoming taller.
 *
 * Three things changed, in order of how much they matter.
 *
 * Search, because sixty-one collapsed rows is a filing cabinet and the person
 * arriving already knows what they want to ask. Typing searches every category
 * at once — titles and answer bodies — and the list becomes results, with the
 * matched words marked so it is obvious why a row is there.
 *
 * A standing category rail rather than pills, so the shape of the help is
 * visible while you read: where you are, what else there is, how much of it.
 *
 * And the answer opens rather than appears — measured height, staggered
 * sections, a proper typographic hierarchy inside it instead of two shades of
 * grey. The content is unchanged; it is the reading of it that was poor.
 */
import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, ChevronDown, Mail, Phone, Search, X, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { HIDDEN_MODULES } from "../hooks/useAuth";
import { DEFAULT_FAQ } from "../lib/faqDefaults";
import { listFaq, listCategories, type FaqSection } from "../lib/faq";
import { JsonLd } from "../components/JsonLd";
import { faqSchema } from "../lib/seo";
import { ModuleShell } from "../components/ModuleShell";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

interface UiEntry { id: string; title: string; moduleId?: string; sections: FaqSection[] }
interface UiCategory { id: string; name: string; entries: UiEntry[] }

/** Split a string on a query so the matched run can be marked. */
function mark(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: "rgba(217,183,117,0.26)", color: ROYAL.text, borderRadius: 3, padding: "0 2px" }}>
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default function FAQ() {
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query).trim();
  const still = prefersReducedMotion();

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
   * Searching crosses categories.
   *
   * Answers are searched as well as titles, because half the time the word
   * somebody remembers ("PIN", "raffle", "recon") is in the answer and the
   * title is a polite paraphrase of it.
   */
  const results = useMemo(() => {
    if (!q) return null;
    const needle = q.toLowerCase();
    const out: { cat: string; entry: UiEntry; why: string }[] = [];
    for (const c of visible) {
      for (const e of c.entries) {
        if (e.title.toLowerCase().includes(needle)) { out.push({ cat: c.name, entry: e, why: "" }); continue; }
        const hit = e.sections.find((s) => (s.body ?? "").toLowerCase().includes(needle));
        if (hit?.body) {
          const i = hit.body.toLowerCase().indexOf(needle);
          out.push({ cat: c.name, entry: e, why: hit.body.slice(Math.max(0, i - 45), i + 90) });
        }
      }
    }
    return out;
  }, [q, visible]);

  const shown: { cat?: string; entry: UiEntry; why?: string }[] = results
    ? results.map((r) => ({ cat: r.cat, entry: r.entry, why: r.why }))
    : (current?.entries ?? []).map((e) => ({ entry: e }));

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

  const total = visible.reduce((n, c) => n + c.entries.length, 0);

  /**
   * How many matches each category holds for the current search.
   *
   * Searching crosses categories, which is right — but the rail then sat there
   * showing the unchanged full counts, so the one moment you most want to know
   * WHERE the answers are was the one moment the rail stopped saying. With this
   * it reads "Module Guide 12" while you type, and a category with nothing in
   * it says so.
   */
  const matchCounts = useMemo(() => {
    if (!q || !results) return null;
    const out = new Map<string, number>();
    for (const r of results) out.set(r.cat, (out.get(r.cat) ?? 0) + 1);
    return out;
  }, [q, results]);

  return (
    <ModuleShell
      eyebrow="StormSync VIP"
      title="Help & FAQ"
      subtitle={`${total} answers about the app, your account and the data behind it.`}
    >
      {schema && <JsonLd id="faq" data={schema} />}

      {/* ── search ──────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: q ? ROYAL.gold : ROYAL.dim }} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(null); }}
          placeholder="Search every answer…"
          aria-label="Search the FAQ"
          className="w-full rounded-2xl pl-10 pr-10 py-3 text-sm outline-none transition-colors"
          style={{
            background: ROYAL.panel,
            border: `1px solid ${q ? ROYAL.goldSoft : ROYAL.hairline}`,
            color: ROYAL.text,
          }}
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: ROYAL.dim }}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-[210px_minmax(0,1fr)] gap-4 lg:gap-6">
        {/* ── the rail ──────────────────────────────────────────────────── */}
        {visible.length > 1 && (
          <nav aria-label="FAQ categories"
               className="lg:sticky lg:top-4 lg:self-start flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible no-scrollbar"
               style={{ scrollbarWidth: "none" }}>
            {visible.map((c) => {
              const on = !q && current?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => { setActiveCat(c.id); setOpen(null); setQuery(""); }}
                  className="relative shrink-0 text-left px-3 py-2 rounded-xl transition-colors"
                  aria-current={on ? "true" : undefined}
                >
                  {on && (
                    <motion.span aria-hidden layoutId="faq-cat" className="absolute inset-0 rounded-xl"
                      transition={still ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
                      style={{ background: ROYAL.goldFaint, border: `1px solid ${ROYAL.goldSoft}` }} />
                  )}
                  <span className="relative flex items-baseline gap-2 whitespace-nowrap lg:whitespace-normal">
                    <span className="text-[12.5px] font-semibold"
                          style={{ color: on ? ROYAL.gold : ROYAL.text, fontFamily: HEADING }}>{c.name}</span>
                    {(() => {
                      const hits = matchCounts?.get(c.name);
                      const searching = matchCounts !== null;
                      return (
                        <span className="text-[10px] tabular-nums ml-auto"
                              style={{ color: searching ? (hits ? ROYAL.gold : "rgba(163,163,204,0.4)") : ROYAL.dim }}>
                          {searching ? (hits ?? 0) : c.entries.length}
                        </span>
                      );
                    })()}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {/* ── the answers ───────────────────────────────────────────────── */}
        {/* One panel, hairline-ruled, rather than a stack of separately-bordered
            cards. Nineteen identical rounded boxes in a column is a wall: every
            row carries the same weight as every other, so nothing can be
            skimmed. Ruled rows read as what this actually is — a reference
            document — and the champagne numeral gives the eye something to
            count down. */}
        <div className="min-w-0">
          {q && (
            <div className="text-[11px] px-1" style={{ color: ROYAL.dim }}>
              {shown.length === 0
                ? <>Nothing matches “<span style={{ color: ROYAL.text }}>{q}</span>”. Try a shorter word.</>
                : <>{shown.length} {shown.length === 1 ? "answer" : "answers"} matching “<span style={{ color: ROYAL.gold }}>{q}</span>”</>}
            </div>
          )}

          <div className="rounded-2xl overflow-hidden"
               style={{
                 background: ROYAL.panel,
                 border: `1px solid ${ROYAL.hairline}`,
                 boxShadow: "0 20px 44px -30px rgba(0,0,0,0.95)",
               }}>
          {shown.map(({ entry: e, cat, why }, i) => {
            const isOpen = open === e.id;
            const lead = e.sections.find((s) => s.body)?.body ?? "";
            return (
              <motion.div
                key={e.id}
                initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: still ? 0.15 : 0.3, delay: still ? 0 : Math.min(i, 10) * 0.028, ease: EASE }}
                className="sx-faq-row relative overflow-hidden"
                style={{
                  background: isOpen ? "rgba(217,183,117,0.045)" : "transparent",
                  borderTop: "none",
                  borderBottom: i === shown.length - 1 ? "none" : `1px solid ${ROYAL.hairline}`,
                }}
              >
                {/* The open row lights its left edge, so you can see where you
                    are in the list without scrolling back to the heading. */}
                {isOpen && (
                  <motion.span aria-hidden layoutId="faq-edge"
                    className="absolute left-0 top-0 bottom-0 w-[2px]"
                    transition={still ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
                    style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, ${ROYAL.goldSoft})` }} />
                )}
                <button
                  onClick={() => setOpen(isOpen ? null : e.id)}
                  aria-expanded={isOpen}
                  className="w-full text-left px-4 py-3.5 flex items-start gap-3"
                >
                  <span className="text-[11px] tabular-nums font-semibold pt-0.5 shrink-0 w-6"
                        style={{ color: isOpen ? ROYAL.gold : "rgba(163,163,204,0.5)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    {cat && (
                      <div className="text-[9px] uppercase tracking-[0.24em] mb-1" style={{ color: ROYAL.gold }}>{cat}</div>
                    )}
                    <div className="text-[14px] font-semibold leading-snug"
                         style={{ color: ROYAL.text, fontFamily: HEADING }}>
                      {mark(e.title, q)}
                    </div>
                    {!isOpen && (why || lead) && (
                      <div className="text-[11.5px] mt-1 line-clamp-2" style={{ color: ROYAL.dim }}>
                        {why ? <>…{mark(why, q)}…</> : lead.slice(0, 120) + (lead.length > 120 ? "…" : "")}
                      </div>
                    )}
                  </div>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={still ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 26 }}
                    className="shrink-0 mt-0.5"
                  >
                    <ChevronDown className="w-4 h-4" style={{ color: isOpen ? ROYAL.gold : ROYAL.dim }} />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="body"
                      initial={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      animate={still ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                      exit={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: still ? 0.15 : 0.3, ease: EASE }}
                      style={{ overflow: "hidden" }}
                    >
                      {/* Indented to the title, not to the numeral. The number
                          column is 1.5rem plus a 0.75rem gap, so the answer
                          hangs off the question rather than off the margin. */}
                      <div className="pr-4 pb-4 pt-1 space-y-3 pl-[3.25rem]">
                        {e.sections.map((s, si) => (
                          <motion.div
                            key={si}
                            initial={still ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: still ? 0 : 0.28, delay: still ? 0 : 0.05 + si * 0.05, ease: EASE }}
                          >
                            {s.heading && (
                              <div className="text-[9.5px] font-bold uppercase tracking-[0.22em] mb-1"
                                   style={{ color: ROYAL.gold }}>{s.heading}</div>
                            )}
                            <p className="text-[13px] leading-relaxed max-w-[62ch]" style={{ color: ROYAL.dim }}>
                              {mark(s.body ?? "", q)}
                            </p>
                          </motion.div>
                        ))}
                        {e.moduleId && e.moduleId.startsWith("/") && (
                          <Link href={e.moduleId}
                                className="inline-flex items-center gap-1.5 text-[12px] font-semibold group"
                                style={{ color: ROYAL.gold }}>
                            Open {e.title}
                            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
          </div>
        </div>
      </div>

      {/* ── still stuck ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-4 space-y-2.5"
           style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <h3 className="text-sm font-bold flex items-center gap-2" style={{ fontFamily: HEADING, color: ROYAL.text }}>
          <HelpCircle className="w-4 h-4" style={{ color: ROYAL.gold }} /> Still need help?
        </h3>
        <div className="grid sm:grid-cols-2 gap-2">
          <Link href="/contact" className="group rounded-xl px-3 py-2.5 transition-colors"
                style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}` }}>
            <div className="text-[12.5px] font-semibold flex items-center gap-1.5" style={{ color: ROYAL.text }}>
              <Mail className="w-3.5 h-3.5" style={{ color: ROYAL.gold }} /> Customer Service
            </div>
            <div className="text-[11px] mt-0.5 pl-5" style={{ color: ROYAL.dim }}>
              Billing, access and account matters — routed to SSWX Internal Affairs.
            </div>
          </Link>
          <Link href="/contact" className="group rounded-xl px-3 py-2.5 transition-colors"
                style={{ background: "rgba(255,82,87,0.06)", border: "1px solid rgba(255,82,87,0.25)" }}>
            <div className="text-[12.5px] font-semibold flex items-center gap-1.5" style={{ color: ROYAL.text }}>
              <Phone className="w-3.5 h-3.5" style={{ color: "#ff8a8a" }} /> Emergency Storm Contact
            </div>
            <div className="text-[11px] mt-0.5 pl-5" style={{ color: ROYAL.dim }}>
              Tier 4 only, PIN required.
            </div>
          </Link>
        </div>
      </div>
    </ModuleShell>
  );
}

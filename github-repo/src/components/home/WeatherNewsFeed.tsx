/**
 * Weather News — the half you can read here, and the half you cannot.
 *
 * The ask was to read the article without leaving the site. Most of the time
 * that is not ours to give: an article belongs to whoever wrote it, and lifting
 * the text off their page onto ours is not a technical problem with a clever
 * solution, it is somebody else's copyright. What a publisher puts in their own
 * RSS feed, though, is offered — that is the entire purpose of the field — and
 * several of the feeds behind this tab syndicate a real summary or the whole
 * piece.
 *
 * So the tab now comes in two parts, and the split is honest about which is
 * which:
 *
 *   • READ HERE — stories whose publisher syndicated enough text to be worth
 *     reading. Tap and the card opens in place with their words and their lead
 *     image, and the link out is still there for the rest of the piece.
 *
 *   • HEADLINES — everything Google News aggregates, which is where the local
 *     coverage of an actual tornado lives. Google's feed carries no article
 *     text at all (its `<description>` is the headline again, inside a link),
 *     so these behave as they always did and open the publisher's site.
 *
 * Nothing pretends to be the other. A headline card never grows an expander it
 * cannot fill, which was the alternative and would have been worse than
 * leaving the tab alone.
 */
import { memo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Newspaper, ExternalLink, Clock, ChevronDown, BookOpen } from "lucide-react";
import { ROYAL, HEADING, EASE, SPRING } from "../../lib/royal";

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
  body?: string;
  image?: string;
  readable?: boolean;
}

interface Props {
  items: NewsItem[];
  loading: boolean;
  still: boolean;
  timeAgo: (iso: string) => string;
}

export const WeatherNewsFeed = memo(function WeatherNewsFeed({
  items, loading, still, timeAgo,
}: Props) {
  const [open, setOpen] = useState<string | null>(null);

  const readable = items.filter((i) => i.readable && i.body);
  const headlines = items.filter((i) => !i.readable || !i.body);

  if (loading && items.length === 0) {
    return (
      <div className="rounded-2xl p-10 text-center"
           style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <Newspaper className="w-7 h-7 mx-auto mb-2 animate-pulse" style={{ color: ROYAL.goldSoft }} />
        <p className="text-sm" style={{ color: ROYAL.dim }}>Pulling the latest weather headlines…</p>
      </div>
    );
  }
  if (!loading && items.length === 0) {
    return (
      <div className="rounded-2xl p-10 text-center"
           style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <Newspaper className="w-7 h-7 mx-auto mb-2" style={{ color: ROYAL.dim }} />
        <p className="text-sm" style={{ color: ROYAL.dim }}>No headlines available right now. Try again shortly.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {readable.length > 0 && (
        <section className="space-y-2">
          <Heading icon={BookOpen} label="Read here"
                   note={`${readable.length} ${readable.length === 1 ? "story" : "stories"} the publisher syndicated in full`} />
          <div className="space-y-2">
            {readable.map((n) => (
              <ReadableCard
                key={n.link}
                item={n}
                open={open === n.link}
                onToggle={() => setOpen((v) => (v === n.link ? null : n.link))}
                still={still}
                timeAgo={timeAgo}
              />
            ))}
          </div>
        </section>
      )}

      {headlines.length > 0 && (
        <section className="space-y-2">
          <Heading icon={Newspaper} label="Headlines"
                   note="aggregated from Google News — these open the publisher's site" />
          <div className="grid md:grid-cols-2 gap-2">
            {headlines.map((n) => (
              <a key={n.link} href={n.link} target="_blank" rel="noopener noreferrer"
                 className="block rounded-xl p-3.5 transition-colors hover:bg-white/[0.03]"
                 style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
                <div className="text-[13px] font-bold leading-snug line-clamp-2 break-words"
                     style={{ color: ROYAL.text }}>{n.title}</div>
                <Meta source={n.source} when={timeAgo(n.pubDate)} trailing={<ExternalLink className="w-2.5 h-2.5" />} />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
});

function Heading({
  icon: Icon, label, note,
}: { icon: typeof BookOpen; label: string; note: string }) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap px-0.5">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em]"
            style={{ color: ROYAL.gold }}>
        <Icon className="w-3 h-3" /> {label}
      </span>
      <span className="text-[10.5px]" style={{ color: ROYAL.dim }}>{note}</span>
    </div>
  );
}

function Meta({ source, when, trailing }: { source: string; when: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-2 text-[10px]" style={{ color: ROYAL.dim }}>
      <span className="uppercase tracking-widest truncate max-w-[45%]">{source}</span>
      <span>·</span>
      <span className="flex items-center gap-1 shrink-0"><Clock className="w-2.5 h-2.5" /> {when}</span>
      {trailing && <span className="ml-auto shrink-0" style={{ color: ROYAL.gold }}>{trailing}</span>}
    </div>
  );
}

function ReadableCard({
  item, open, onToggle, still, timeAgo,
}: { item: NewsItem; open: boolean; onToggle: () => void; still: boolean; timeAgo: (s: string) => string }) {
  // A blank line is a paragraph; a single newline is a line break the publisher
  // meant. Splitting on every newline instead turned the hurricane centre's
  // teletype outlook into thirty one-line paragraphs with a gap between each.
  const paras = (item.body ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="rounded-xl overflow-hidden"
         style={{ background: ROYAL.panel, border: `1px solid ${open ? ROYAL.goldSoft : ROYAL.hairline}` }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left p-3.5 transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-start gap-3">
          {item.image && (
            <img
              src={item.image}
              alt=""
              loading="lazy"
              // A publisher's image that 404s should leave the card looking
              // deliberate rather than leaving a broken-image glyph in it.
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              className="w-16 h-16 rounded-lg object-cover shrink-0"
              style={{ border: `1px solid ${ROYAL.hairline}` }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-bold leading-snug break-words"
                 style={{ fontFamily: HEADING, color: ROYAL.text }}>{item.title}</div>
            {!open && item.description && (
              <div className="text-[11.5px] line-clamp-2 mt-1" style={{ color: ROYAL.dim }}>{item.description}</div>
            )}
            <Meta
              source={item.source}
              when={timeAgo(item.pubDate)}
              trailing={
                <motion.span
                  animate={{ rotate: open ? 180 : 0 }}
                  transition={still ? { duration: 0 } : SPRING.pop}
                  className="inline-flex"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </motion.span>
              }
            />
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={still ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: still ? 0.15 : 0.32, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3.5 pt-0 space-y-2.5">
              <span aria-hidden className="block h-px"
                    style={{ background: `linear-gradient(90deg, ${ROYAL.goldSoft}, transparent)` }} />
              {item.image && (
                <img src={item.image} alt="" loading="lazy"
                     onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                     className="w-full rounded-lg object-cover max-h-64"
                     style={{ border: `1px solid ${ROYAL.hairline}` }} />
              )}
              <div className="space-y-2">
                {paras.map((p, i) => (
                  <p key={i} className="text-[13px] leading-relaxed"
                     style={{ color: ROYAL.text, whiteSpace: "pre-line" }}>{p}</p>
                ))}
              </div>
              <a href={item.link} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                 style={{ background: ROYAL.goldFaint, border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
                Read the full story at {item.source} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

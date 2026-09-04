import { useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { unreadCount, isUnread, markSeen, primeSeen } from "../lib/unread";
import { AppUpdatesTab } from "../components/home/AppUpdatesTab";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { listNews } from "../lib/news";
import { InstallApp } from "../components/InstallApp";
import { NameWall } from "../components/NameWall";
import { renderMarkdown } from "../lib/markdown";
import { useAuth } from "../hooks/useAuth";
import DailyBriefing from "../components/DailyBriefing";
import { Newspaper, AlertCircle, Sparkles, ArrowRight, ExternalLink, Clock } from "lucide-react";
const logoUrl = "/img/logo-lg.webp";

/**
 * The mark, at half what it was, and the unit everything under it is sized
 * from. The brief was "make the buttons size relative to the logo", so this is
 * the single number to change — the row below scales with it instead of
 * drifting the next time the header is touched.
 */
const LOGO = 58;
const BTN_H = Math.round(LOGO * 0.62);

type Tab = "weather" | "sswx" | "updates";

/** A real button, not a text link, at a height derived from the logo. */
function HomeButton({
  href, tone, children,
}: { href: string; tone: "primary" | "alert" | "muted"; children: React.ReactNode }) {
  const skin =
    tone === "primary" ? "bg-primary/20 border-primary/40 text-primary hover:bg-primary/30"
    : tone === "alert" ? "bg-red-500/15 border-red-500/30 text-red-300 hover:bg-red-500/25"
    : "bg-muted/30 border-border hover:bg-muted/50";
  return (
    <Link href={href}
      className={`rounded-xl border font-semibold inline-flex items-center justify-center gap-1.5 px-4 transition-colors active:scale-[0.97] ${skin}`}
      style={{ height: BTN_H, fontSize: Math.round(BTN_H * 0.36) }}>
      {children}
    </Link>
  );
}

/**
 * A news tab.
 *
 * The active state is a single pill that slides between tabs via a shared
 * layout id, rather than three backgrounds crossfading — the movement is what
 * tells you which way you went, and it is one animated element instead of
 * three. The unread mark is a count that breathes rather than a static dot,
 * because a dot that has always been there stops being read as new.
 */
function NewsTab({
  id, active, onPick, icon: Icon, label, badge = 0,
}: {
  id: Tab; active: Tab; onPick: (t: Tab) => void;
  icon: React.ComponentType<{ className?: string }>; label: string; badge?: number;
}) {
  const on = active === id;
  return (
    <button onClick={() => onPick(id)}
      className="relative py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors overflow-hidden"
      aria-pressed={on}>
      {on && (
        <motion.span layoutId="news-tab-pill" aria-hidden
          className="absolute inset-0 rounded-lg bg-primary/15"
          transition={{ type: "spring", stiffness: 420, damping: 34 }} />
      )}
      <motion.span className="relative flex items-center gap-2 min-w-0"
                   animate={{ scale: on ? 1 : 0.97, opacity: on ? 1 : 0.72 }}
                   transition={{ duration: 0.18 }}
                   style={{ color: on ? "var(--sswx-tab-on, #ccccff)" : undefined }}>
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{label}</span>
      </motion.span>
      <AnimatePresence>
        {badge > 0 && (
          <motion.span
            key="badge"
            className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9.5px] font-bold grid place-items-center"
            style={{ background: "#e2373c", color: "#fff" }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [1, 1.18, 1], opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ scale: { duration: 1.9, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.2 } }}
          >
            {badge > 9 ? "9+" : badge}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
}

import { BASE_API } from "../config";

export default function Home() {
  const [tab, setTab] = useState<Tab>("sswx");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { user } = useAuth();
  const { data: posts = [] } = useQuery({ queryKey: ["sswx-news", user?.tier ?? 1], queryFn: () => listNews(user?.tier ?? 1), staleTime: 5 * 60 * 1000 });

  /**
   * How many SSWX posts have landed since this person last looked.
   *
   * Primed on the first ever visit so nobody is greeted by a badge counting
   * the entire back catalogue, and cleared the moment the tab is actually
   * opened rather than when the page loads — the point is "you have not seen
   * this", and loading the Home page is not seeing it.
   */
  // `publishAt` is when a scheduled post goes live and is what a member would
  // call its date; `createdAt` covers anything published immediately.
  const postDates = useMemo(() => posts.map((p) => p.publishAt ?? p.createdAt), [posts]);
  const [unreadSswx, setUnreadSswx] = useState(0);
  useEffect(() => {
    if (postDates.length === 0) return;
    primeSeen("sswx-news", postDates[0]);
    setUnreadSswx(unreadCount("sswx-news", postDates));
  }, [postDates]);
  useEffect(() => {
    if (tab !== "sswx" || postDates.length === 0) return;
    // Give the animation a moment to be seen before it is marked read.
    const t = setTimeout(() => { markSeen("sswx-news", postDates[0]); setUnreadSswx(0); }, 2200);
    return () => clearTimeout(t);
  }, [tab, postDates]);

  useEffect(() => {
    let cancelled = false;
    /**
     * Headlines, with a deadline.
     *
     * This used to be a bare fetch with no time limit, and `newsLoading` only
     * ever cleared in `then` or `catch`. A request that neither resolves nor
     * rejects — which is exactly what a service worker sitting on a dead
     * network produces — left "Pulling the latest weather headlines…" on screen
     * for as long as the tab stayed open. A spinner that never stops is a
     * worse answer than "nothing right now", because it tells you to keep
     * waiting for something that is not coming.
     */
    const loadNews = () => {
      setNewsLoading(true);
      const ctl = new AbortController();
      const bail = setTimeout(() => ctl.abort(), 12_000);
      fetch(`${BASE_API}/news/weather?topic=severe+weather+OR+tornado+OR+hurricane+OR+storm`,
            { signal: ctl.signal })
        .then(r => r.ok ? r.json() : { items: [] })
        .then(d => { if (!cancelled) setNews(d.items ?? []); })
        .catch(() => { /* aborted, offline, or a bad payload — all "no headlines" */ })
        .finally(() => { clearTimeout(bail); if (!cancelled) setNewsLoading(false); });
    };
    loadNews();
    const t = setInterval(loadNews, 10 * 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  function timeAgo(iso: string): string {
    const d = new Date(iso).getTime();
    if (Number.isNaN(d)) return "";
    const diff = (Date.now() - d) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
  function isFresh(iso: string): boolean {
    const d = new Date(iso).getTime();
    return !Number.isNaN(d) && Date.now() - d < 12 * 60 * 60_000;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* ── the mark ──────────────────────────────────────────────────────
          Half the size it was. The paragraph underneath it is gone: it said
          what the app is to somebody already inside the app, and it was the
          reason the logo needed a whole banner to sit in. What is left is the
          mark and the name, and the three things people actually come here to
          press — which are now real buttons, on the outside, sized off the
          logo so the group scales as one object. */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-[#0f0a1f] via-[#1a0d2e] to-[#0a0518] px-4 py-4 md:px-6 md:py-5">
        <div className="absolute -top-16 -right-16 w-52 h-52 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-52 h-52 rounded-full bg-purple-700/15 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3 md:gap-4">
          <img src={logoUrl} alt="StormSync Media" width={512} height={512}
               className="rounded-xl object-cover drop-shadow-[0_0_18px_rgba(168,85,247,0.45)] shrink-0"
               style={{ width: LOGO, height: LOGO }} />
          <div className="min-w-0">
            <div className="text-[9px] md:text-[10px] text-primary uppercase tracking-[0.4em]">Welcome to</div>
            <h1 className="font-bold uppercase tracking-widest leading-tight text-[19px] md:text-[26px]">
              StormSync Media
            </h1>
          </div>
        </div>
      </div>

      {/* Underneath and outside, as asked. Height and type are derived from the
          logo rather than fixed, so shrinking the mark shrinks these with it. */}
      <div className="flex flex-wrap gap-2">
        <HomeButton href="/dashboard" tone="primary">
          Open Dashboard <ArrowRight className="w-3.5 h-3.5" />
        </HomeButton>
        <HomeButton href="/warnings" tone="alert">
          <AlertCircle className="w-3.5 h-3.5" /> Live Warnings
        </HomeButton>
        <InstallApp variant="compact" />
        {!user && (
          <HomeButton href="/login" tone="muted">Create Account</HomeButton>
        )}
      </div>

      {/* ── the briefing, and the wall beside it ─────────────────────────
          One row on anything wide enough to hold two readable columns, and
          stacked below that — a chalkboard squeezed into half a phone screen
          is neither a wall nor a briefing. `items-stretch` is what makes the
          board match the briefing's height rather than guessing at it. */}
      <div className="grid lg:grid-cols-2 gap-4 items-stretch">
        <DailyBriefing compact />
        <div className="min-h-[190px]"><NameWall /></div>
      </div>

      {/* ── news ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-1.5 bg-card border border-border rounded-xl p-1.5">
        <NewsTab id="sswx"    active={tab} onPick={setTab} icon={Sparkles}  label="SSWX News"   badge={unreadSswx} />
        <NewsTab id="weather" active={tab} onPick={setTab} icon={Newspaper} label="Weather News" />
        <NewsTab id="updates" active={tab} onPick={setTab} icon={Megaphone} label="App Updates" />
      </div>

      {tab === "updates" && <AppUpdatesTab />}

      {tab === "weather" && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Auto-pulled from Google News. Filter: severe weather, tornado, hurricane, storm. Refreshed every 10 minutes.
          </div>
          {newsLoading && news.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-10 text-center">
              <div className="text-3xl mb-2 animate-pulse">📰</div>
              <p className="text-sm text-muted-foreground">Pulling the latest weather headlines…</p>
            </div>
          )}
          {!newsLoading && news.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-10 text-center">
              <div className="text-3xl mb-2">🌤️</div>
              <p className="text-sm text-muted-foreground">No headlines available right now. Try again shortly.</p>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            {news.slice(0, 10).map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                className="block bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start gap-2">
                  <Newspaper className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold leading-snug line-clamp-2 break-words">{n.title}</div>
                    {n.description && <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{n.description}</div>}
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground/80">
                      <span className="uppercase tracking-widest">{n.source}</span>
                      <span>·</span>
                      <span><Clock className="w-2.5 h-2.5 inline mr-0.5" /> {timeAgo(n.pubDate)}</span>
                      <ExternalLink className="w-2.5 h-2.5 ml-auto text-primary" />
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {tab === "sswx" && (
        <div className="space-y-3">
          {posts.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-10 text-center space-y-2">
              <Newspaper className="w-10 h-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No SSWX News posts yet. Admins can publish from the Admin Panel.</p>
              {user?.isAdmin && <Link href="/admin" className="inline-block text-xs text-primary hover:underline">Open Admin Panel →</Link>}
            </div>
          )}
          <div className="space-y-2">
            {posts.map(p => {
              const open = expandedId === p.id;
              const fresh = isFresh(p.createdAt);
              // "Fresh" is about the post (published today). "Unseen" is about
              // this reader, and it is the one worth animating: a post from
              // last week that they have never opened is new TO THEM, and a
              // post from an hour ago they already read is not.
              const unseen = isUnread("sswx-news", p.publishAt ?? p.createdAt);
              return (
                <motion.div key={p.id}
                  initial={false}
                  animate={unseen ? "unseen" : "seen"}
                  variants={{
                    seen: { boxShadow: "0 0 0px 0px rgba(168,180,232,0)" },
                    unseen: {
                      // A slow swell rather than a flash: it has to be
                      // noticeable in peripheral vision without being the
                      // thing you are fighting to read past.
                      boxShadow: [
                        "0 0 0px 0px rgba(168,180,232,0.0)",
                        "0 0 22px -2px rgba(168,180,232,0.55)",
                        "0 0 0px 0px rgba(168,180,232,0.0)",
                      ],
                      transition: { duration: 2.6, repeat: Infinity, ease: "easeInOut" },
                    },
                  }}
                  className={`relative rounded-xl overflow-hidden border ${fresh || unseen
                    ? "border-[#a8b4e8] bg-gradient-to-br from-[#1a1f3a] to-[#0d1024]"
                    : "border-border bg-card"}`}>
                  {/* The same treatment a new chase gets, in the news palette:
                      a sheen crossing the face, a top edge that brightens, and
                      a pill. Three motions at three speeds is what keeps it
                      from reading as a box blinking on and off. */}
                  {unseen && (
                    <>
                      <motion.span aria-hidden
                        className="pointer-events-none absolute inset-y-0 w-32 z-0"
                        style={{ background: "linear-gradient(90deg, transparent, rgba(168,180,232,0.22), transparent)" }}
                        initial={{ x: -160 }} animate={{ x: 900 }}
                        transition={{ duration: 2.1, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }} />
                      <motion.span aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-px z-10"
                        style={{ background: "linear-gradient(90deg, transparent, #a8b4e8, transparent)" }}
                        initial={{ opacity: 0.3 }} animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }} />
                      <motion.span aria-label="New" title="New since your last visit"
                        className="absolute top-2 right-2 z-20 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.14em]"
                        style={{ background: "#a8b4e8", color: "#0d1024" }}
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: [1, 1.07, 1], opacity: 1 }}
                        transition={{ scale: { duration: 1.8, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.3 } }}>
                        New
                      </motion.span>
                    </>
                  )}
                  <button onClick={() => setExpandedId(open ? null : p.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/10 transition-colors flex items-center gap-3 ${fresh ? "bg-[#7B8FD9]/15" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.pinned && <span title="Pinned" className="text-primary">📌</span>}
                        <div className={`text-sm font-bold truncate ${fresh ? "text-[#c7d0f0]" : ""}`}>{p.title}</div>
                        {p.category && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase bg-primary/15 text-primary border border-primary/30">{p.category}</span>
                        )}
                        {fresh && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase bg-[#a8b4e8]/25 text-[#c7d0f0] border border-[#a8b4e8]/50 animate-pulse">
                            New
                          </span>
                        )}
                      </div>
                      {p.excerpt && <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{p.excerpt}</div>}
                      <div className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(p.createdAt)} · {p.author}</div>
                    </div>
                    <ArrowRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                  </button>
                  {open && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                      {p.imageUrl && (
                        <div className="rounded-lg overflow-hidden border border-border bg-black">
                          <img src={p.imageUrl} alt={p.title} loading="lazy" decoding="async" className="w-full h-auto" />
                        </div>
                      )}
                      <div className="text-sm space-y-1.5" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.body) }} />
                      {p.videoUrl && (
                        <div className="rounded-lg overflow-hidden border border-border bg-black">
                          {p.videoUrl.includes("youtube") || p.videoUrl.includes("youtu.be") ? (
                            <iframe src={p.videoUrl.replace("watch?v=", "embed/")} className="w-full aspect-video" allowFullScreen />
                          ) : (
                            <video src={p.videoUrl} controls className="w-full" />
                          )}
                        </div>
                      )}
                      {p.embedHtml && <div dangerouslySetInnerHTML={{ __html: p.embedHtml }} />}
                      {p.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {p.tags.map(t => <span key={t} className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">#{t}</span>)}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick navigation tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Dashboard", icon: "📊", path: "/dashboard" },
          { label: "SPC Outlook", icon: "⚡", path: "/spc" },
          { label: "Warnings & Reports", icon: "🚨", path: "/warnings" },
          { label: "Forecast Game", icon: "🎮", path: "/game" },
        ].map(t => (
          <Link key={t.label} href={t.path} className="bg-card border border-border rounded-xl p-4 text-center hover:border-primary/40 transition-colors">
            <div className="text-2xl mb-1">{t.icon}</div>
            <div className="text-sm font-semibold">{t.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { AppUpdatesTab } from "../components/home/AppUpdatesTab";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { listNews } from "../lib/news";
import { InstallApp } from "../components/InstallApp";
import { renderMarkdown } from "../lib/markdown";
import { useAuth } from "../hooks/useAuth";
import DailyBriefing from "../components/DailyBriefing";
import { Newspaper, AlertCircle, Sparkles, ArrowRight, ExternalLink, Clock } from "lucide-react";
const logoUrl = "/img/logo-lg.webp";

type Tab = "weather" | "sswx" | "updates";

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
}

import { BASE_API } from "../config";

export default function Home() {
  const [tab, setTab] = useState<Tab>("weather");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { user } = useAuth();
  const { data: posts = [] } = useQuery({ queryKey: ["sswx-news", user?.tier ?? 1], queryFn: () => listNews(user?.tier ?? 1), staleTime: 5 * 60 * 1000 });

  useEffect(() => {
    const loadNews = () => {
      setNewsLoading(true);
      fetch(`${BASE_API}/news/weather?topic=severe+weather+OR+tornado+OR+hurricane+OR+storm`)
        .then(r => r.ok ? r.json() : { items: [] })
        .then(d => { setNews(d.items ?? []); setNewsLoading(false); })
        .catch(() => setNewsLoading(false));
    };
    loadNews();
    const t = setInterval(loadNews, 10 * 60_000);
    return () => clearInterval(t);
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
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-[#0f0a1f] via-[#1a0d2e] to-[#0a0518] p-6 md:p-10">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-purple-700/20 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row items-center gap-6">
          <img src={logoUrl} alt="StormSync Media" width={512} height={512} className="w-28 h-28 md:w-32 md:h-32 rounded-2xl object-cover drop-shadow-[0_0_24px_rgba(168,85,247,0.5)]" />
          <div className="flex-1 text-center md:text-left">
            <div className="text-[10px] text-primary uppercase tracking-[0.4em] mb-1">Welcome to</div>
            <h1 className="text-3xl md:text-5xl font-bold uppercase tracking-widest">StormSync Media</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-xl">
              Real-time severe weather intelligence, original analysis, and a community of storm watchers.
              {user ? ` Welcome back, ${user.name.split(" ")[0]}.` : " Sign up to unlock your tier of modules."}
            </p>
            <div className="flex gap-2 mt-4 justify-center md:justify-start flex-wrap">
              <Link href="/dashboard" className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30">
                Open Dashboard <ArrowRight className="w-3 h-3 inline ml-1" />
              </Link>
              {!user && (
                <Link href="/login" className="px-4 py-2 rounded-lg bg-muted/30 border border-border text-sm font-semibold hover:bg-muted/50">
                  Create Account
                </Link>
              )}
              <Link href="/warnings" className="px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-sm font-semibold hover:bg-red-500/25">
                <AlertCircle className="w-3 h-3 inline mr-1" /> Live Warnings
              </Link>
              <InstallApp variant="compact" />
            </div>
          </div>
        </div>
      </div>

      {/* Storm Engine — today's national severe-weather briefing */}
      <DailyBriefing />

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 bg-card border border-border rounded-xl p-1.5">
        <button onClick={() => setTab("weather")}
          className={`py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors ${tab === "weather" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          <Newspaper className="w-4 h-4" /> <span className="truncate">Weather News</span>
        </button>
        <button onClick={() => setTab("sswx")}
          className={`py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors ${tab === "sswx" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          <Sparkles className="w-4 h-4" /> <span className="truncate">SSWX News</span>
        </button>
        <button onClick={() => setTab("updates")}
          className={`py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors ${tab === "updates" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          <Megaphone className="w-4 h-4" /> <span className="truncate">App Updates</span>
        </button>
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
              return (
                <div key={p.id}
                  className={`rounded-xl overflow-hidden border transition-shadow ${fresh
                    ? "border-[#a8b4e8] shadow-[0_0_18px_-2px_rgba(168,180,232,0.55)] bg-gradient-to-br from-[#1a1f3a] to-[#0d1024]"
                    : "border-border bg-card"}`}>
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
                </div>
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

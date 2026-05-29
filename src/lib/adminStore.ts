// Lightweight localStorage-backed stores for admin-managed content.
// NOTE: persistence is browser-local. For multi-user production, migrate
// these stores to the api-server (postgres + drizzle).

export interface NewsPost {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  videoUrl?: string;
  embedHtml?: string;
  author: string;
  createdAt: string;
}

export interface Broadcast {
  id: string;
  message: string;
  level: "info" | "warning" | "alert";
  createdAt: string;
  targetUserId?: string | null;
}

export interface ContactSubmission {
  id: string;
  kind: "contact" | "customer-service" | "emergency";
  name: string;
  email?: string;
  phone?: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface GameGuess {
  id: string;
  userId: string;
  userName: string;
  lat: number;
  lon: number;
  cityLabel: string;
  date: string; // YYYY-MM-DD
  points?: number;
}

export interface MonthlyWinner {
  month: string; // YYYY-MM
  userId: string;
  userName: string;
  points: number;
}

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(`store-${key}`));
}

export const newsStore = {
  list: (): NewsPost[] => read("stormsync_news_v1", []),
  add: (p: Omit<NewsPost, "id" | "createdAt">) => {
    const all = newsStore.list();
    const post: NewsPost = { ...p, id: `n_${Date.now()}`, createdAt: new Date().toISOString() };
    write("stormsync_news_v1", [post, ...all]);
    return post;
  },
  remove: (id: string) => {
    write("stormsync_news_v1", newsStore.list().filter(p => p.id !== id));
  },
};

export const broadcastStore = {
  list: (): Broadcast[] => read("stormsync_broadcasts_v1", []),
  add: (b: Omit<Broadcast, "id" | "createdAt">) => {
    const all = broadcastStore.list();
    const bc: Broadcast = { ...b, id: `b_${Date.now()}`, createdAt: new Date().toISOString() };
    write("stormsync_broadcasts_v1", [bc, ...all]);
    return bc;
  },
  remove: (id: string) => {
    write("stormsync_broadcasts_v1", broadcastStore.list().filter(b => b.id !== id));
  },
  getUnseen: (userId: string): Broadcast[] => {
    const seen = new Set(read<string[]>(`stormsync_seen_${userId}_v1`, []));
    return broadcastStore.list().filter(b => !seen.has(b.id) && (!b.targetUserId || b.targetUserId === userId));
  },
  markSeen: (userId: string, id: string) => {
    const seen = read<string[]>(`stormsync_seen_${userId}_v1`, []);
    if (!seen.includes(id)) {
      write(`stormsync_seen_${userId}_v1`, [...seen, id]);
    }
  },
};

export const contactStore = {
  list: (): ContactSubmission[] => read("stormsync_contact_v1", []),
  add: (s: Omit<ContactSubmission, "id" | "createdAt" | "read">) => {
    const all = contactStore.list();
    const sub: ContactSubmission = { ...s, id: `c_${Date.now()}`, createdAt: new Date().toISOString(), read: false };
    write("stormsync_contact_v1", [sub, ...all]);
    return sub;
  },
  remove: (id: string) => {
    write("stormsync_contact_v1", contactStore.list().filter(s => s.id !== id));
  },
  markRead: (id: string) => {
    write("stormsync_contact_v1", contactStore.list().map(s => s.id === id ? { ...s, read: true } : s));
  },
};

export const gameStore = {
  guesses: (): GameGuess[] => read("stormsync_game_v1", []),
  addGuess: (g: Omit<GameGuess, "id">) => {
    const all = gameStore.guesses();
    const guess: GameGuess = { ...g, id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    write("stormsync_game_v1", [guess, ...all]);
    return guess;
  },
  todayGuesses: (date: string): GameGuess[] =>
    gameStore.guesses().filter(g => g.date === date),
  monthlyLeaderboard: (yyyymm: string) => {
    const all = gameStore.guesses().filter(g => g.date.startsWith(yyyymm));
    const totals = new Map<string, { name: string; points: number; games: number }>();
    for (const g of all) {
      const cur = totals.get(g.userId) ?? { name: g.userName, points: 0, games: 0 };
      cur.points += g.points ?? 0;
      cur.games += 1;
      totals.set(g.userId, cur);
    }
    return [...totals.entries()]
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => b.points - a.points);
  },
  winners: (): MonthlyWinner[] => read("stormsync_winners_v1", []),
  recordWinner: (w: MonthlyWinner) => {
    const all = gameStore.winners().filter(x => x.month !== w.month);
    write("stormsync_winners_v1", [w, ...all]);
  },
};

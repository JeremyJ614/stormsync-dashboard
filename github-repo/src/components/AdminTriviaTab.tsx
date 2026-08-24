import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminListQuestions, adminSaveQuestion, adminDeleteQuestion, adminSetPoints,
  todayUTC, type TriviaQuestion, type QuestionInput,
} from "../lib/trivia";
import {
  Brain, Plus, Trash2, Pencil, Save, X, Check, Loader2, Sparkles,
  UserCog, AlertTriangle, CalendarDays, Power,
} from "lucide-react";

/**
 * Admin → Daily Trivia (P-5.2).
 *
 * Write your own questions, drop them on any date, override either of the two
 * AI-generated slots or add a third, and set points per question.
 *
 * `trivia_questions` is UNIQUE (ask_date, slot), so "override slot 1" is just an
 * upsert on that key — the admin question replaces whatever the generator put
 * there and is marked source='admin'. The generator is written to never
 * overwrite an admin-authored row, so an override sticks.
 */

const BLANK: QuestionInput = {
  askDate: todayUTC(), slot: 1, category: "weather",
  question: "", choices: ["", "", "", ""], answerIndex: 0,
  explanation: "", points: 100, active: true,
};

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function AdminTriviaTab() {
  const today = todayUTC();
  const [from, setFrom] = useState(addDays(today, -7));
  const [to, setTo] = useState(addDays(today, 14));
  const [rows, setRows] = useState<TriviaQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<{ input: QuestionInput; id?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setErr("");
    try { setRows(await adminListQuestions(from, to)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load questions"); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { reload(); }, [reload]);

  // Group by date, newest first, so a day's slots sit together.
  const byDate = useMemo(() => {
    const m = new Map<string, TriviaQuestion[]>();
    for (const q of rows) {
      const list = m.get(q.askDate) ?? [];
      list.push(q); m.set(q.askDate, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.slot - b.slot);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  function startNew(date?: string) {
    const d = date ?? today;
    const used = new Set(rows.filter((q) => q.askDate === d).map((q) => q.slot));
    // First free slot — 1 and 2 are the generator's, 3+ is a bonus question.
    let slot = 1;
    while (used.has(slot) && slot < 9) slot++;
    setEditing({ input: { ...BLANK, askDate: d, slot } });
  }

  function startEdit(q: TriviaQuestion) {
    setEditing({
      id: q.id,
      input: {
        askDate: q.askDate, slot: q.slot, category: q.category,
        question: q.question,
        choices: q.choices.length ? [...q.choices] : ["", "", "", ""],
        answerIndex: q.answerIndex ?? 0,
        explanation: q.explanation ?? "",
        points: q.points, active: q.active,
      },
    });
  }

  async function save() {
    if (!editing) return;
    const i = editing.input;
    const choices = i.choices.map((c) => c.trim()).filter(Boolean);
    if (!i.question.trim()) { setErr("Question text is required."); return; }
    if (choices.length < 2) { setErr("Give at least two answer choices."); return; }
    if (i.answerIndex >= choices.length) { setErr("The correct answer points at a blank choice."); return; }
    if (!Number.isFinite(i.points) || i.points < 0) { setErr("Points must be zero or more."); return; }

    setSaving(true); setErr("");
    const res = await adminSaveQuestion({ ...i, question: i.question.trim(), choices }, editing.id);
    setSaving(false);
    if (!res.ok) { setErr(res.error ?? "Save failed"); return; }
    setEditing(null);
    reload();
  }

  async function remove(q: TriviaQuestion) {
    if (!confirm(`Delete the ${q.category} question for ${q.askDate} (slot ${q.slot})?\n\nMembers who already answered keep their points.`)) return;
    await adminDeleteQuestion(q.id);
    reload();
  }

  async function toggleActive(q: TriviaQuestion) {
    await adminSaveQuestion({
      askDate: q.askDate, slot: q.slot, category: q.category, question: q.question,
      choices: q.choices, answerIndex: q.answerIndex ?? 0,
      explanation: q.explanation ?? "", points: q.points, active: !q.active,
    }, q.id);
    reload();
  }

  async function bumpPoints(q: TriviaQuestion, points: number) {
    if (!Number.isFinite(points) || points < 0) return;
    await adminSetPoints(q.id, points);
    setRows((prev) => prev.map((r) => (r.id === q.id ? { ...r, points } : r)));
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Brain className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">Daily Trivia</h2>
        <button onClick={() => startNew()}
          className="ml-auto px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New question
        </button>
      </div>

      <div className="bg-primary/5 border border-primary/25 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
        Two questions a day are generated automatically (slot&nbsp;1 weather, slot&nbsp;2 random).
        Writing your own on <strong className="text-foreground">slot 1 or 2 replaces</strong> that day's generated
        question and the generator will not overwrite it again; <strong className="text-foreground">slot 3+</strong> adds
        a bonus question on top. Questions dated in the future are invisible to members until that date.
      </div>

      {/* range */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <label className="text-muted-foreground">From</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs" />
        <label className="text-muted-foreground">to</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs" />
        <button onClick={reload} className="px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border text-xs font-semibold">Refresh</button>
        <span className="text-muted-foreground ml-auto">{rows.length} question{rows.length === 1 ? "" : "s"}</span>
      </div>

      {err && !editing && (
        <div className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {err}</div>
      )}

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : byDate.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
          No questions in this range. Use <strong>New question</strong> to write one.
        </div>
      ) : (
        <div className="space-y-4">
          {byDate.map(([date, qs]) => (
            <div key={date} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-muted/20 border-b border-border flex items-center gap-2">
                <span className="text-sm font-bold tabular-nums">{date}</span>
                {date === today && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold uppercase tracking-wider">Today</span>}
                {date > today && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#d9b775]/12 text-[#d9b775] font-bold uppercase tracking-wider">Scheduled</span>}
                <button onClick={() => startNew(date)}
                  className="ml-auto text-[11px] text-primary hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" /> add to this day
                </button>
              </div>

              <div className="divide-y divide-border/60">
                {qs.map((q) => (
                  <div key={q.id} className={`p-3 space-y-2 ${q.active ? "" : "opacity-55"}`}>
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 font-bold tabular-nums">SLOT {q.slot}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                        q.category === "weather" ? "bg-[#d9b775]/12 text-[#d9b775]" : "bg-fuchsia-500/15 text-fuchsia-300"}`}>
                        {q.category}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 ${
                        q.source === "admin" ? "bg-yellow-400/15 text-yellow-300" : "bg-muted/40 text-muted-foreground"}`}>
                        {q.source === "admin" ? <><UserCog className="w-2.5 h-2.5" /> yours</> : <><Sparkles className="w-2.5 h-2.5" /> AI</>}
                      </span>
                      {!q.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 font-bold uppercase tracking-wider">hidden</span>}

                      <div className="ml-auto flex items-center gap-1.5">
                        <label className="text-[10px] text-muted-foreground">pts</label>
                        <input
                          type="number" min={0} defaultValue={q.points}
                          onBlur={(e) => bumpPoints(q, parseInt(e.target.value, 10))}
                          className="w-16 bg-muted/30 border border-border rounded px-1.5 py-1 text-xs tabular-nums" />
                        <button onClick={() => toggleActive(q)} title={q.active ? "Hide from members" : "Show to members"}
                          className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground"><Power className="w-3.5 h-3.5" /></button>
                        <button onClick={() => startEdit(q)} title="Edit"
                          className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => remove(q)} title="Delete"
                          className="p-1.5 rounded hover:bg-red-500/15 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>

                    <p className="text-sm font-medium">{q.question}</p>
                    <div className="grid sm:grid-cols-2 gap-1">
                      {q.choices.map((c, i) => (
                        <div key={i} className={`text-xs px-2 py-1 rounded flex items-center gap-1.5 ${
                          i === q.answerIndex ? "bg-emerald-500/12 text-emerald-300 font-semibold" : "bg-muted/20 text-muted-foreground"}`}>
                          {i === q.answerIndex && <Check className="w-3 h-3 shrink-0" />}
                          <span>{c}</span>
                        </div>
                      ))}
                    </div>
                    {q.explanation && <p className="text-[11px] text-muted-foreground italic">{q.explanation}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <QuestionEditor
          state={editing} setState={setEditing} onSave={save} saving={saving} err={err}
          collides={rows.find((r) => r.askDate === editing.input.askDate && r.slot === editing.input.slot && r.id !== editing.id)}
        />
      )}
    </div>
  );
}

function QuestionEditor({ state, setState, onSave, saving, err, collides }: {
  state: { input: QuestionInput; id?: string };
  setState: (s: { input: QuestionInput; id?: string } | null) => void;
  onSave: () => void; saving: boolean; err: string;
  collides?: TriviaQuestion;
}) {
  const i = state.input;
  const set = (patch: Partial<QuestionInput>) => setState({ ...state, input: { ...i, ...patch } });
  const setChoice = (idx: number, v: string) => {
    const choices = [...i.choices]; choices[idx] = v; set({ choices });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start md:items-center justify-center p-3 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl my-6">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">{state.id ? "Edit question" : "New question"}</h3>
          <button onClick={() => setState(null)} className="ml-auto p-1 rounded hover:bg-muted/40 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {collides && !state.id && (
            <div className="text-xs rounded-lg px-3 py-2 bg-yellow-400/10 border border-yellow-400/30 text-yellow-200 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {i.askDate} already has a {collides.source === "admin" ? "hand-written" : "generated"} question in slot {i.slot}.
                Saving <strong>replaces</strong> it.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Date</label>
              <input type="date" value={i.askDate} onChange={(e) => set({ askDate: e.target.value })}
                className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Slot</label>
              <input type="number" min={1} max={9} value={i.slot}
                onChange={(e) => set({ slot: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs tabular-nums" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Category</label>
              <select value={i.category} onChange={(e) => set({ category: e.target.value as "weather" | "random" })}
                className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs">
                <option value="weather">weather</option>
                <option value="random">random</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Points</label>
              <input type="number" min={0} value={i.points}
                onChange={(e) => set({ points: parseInt(e.target.value, 10) || 0 })}
                className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs tabular-nums" />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Question</label>
            <textarea value={i.question} onChange={(e) => set({ question: e.target.value })} rows={2}
              placeholder="What does the 'hook echo' on radar usually indicate?"
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm resize-y" />
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Choices — click the circle to mark the correct one
            </label>
            <div className="space-y-1.5 mt-1">
              {i.choices.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <button onClick={() => set({ answerIndex: idx })} title="Mark correct"
                    className={`w-6 h-6 rounded-full border-2 shrink-0 grid place-items-center transition-colors ${
                      i.answerIndex === idx ? "border-emerald-400 bg-emerald-400/20 text-emerald-300" : "border-border text-transparent hover:border-emerald-400/50"}`}>
                    <Check className="w-3 h-3" />
                  </button>
                  <input value={c} onChange={(e) => setChoice(idx, e.target.value)}
                    placeholder={`Choice ${idx + 1}${idx > 1 ? " (optional)" : ""}`}
                    className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-sm" />
                  {i.choices.length > 2 && (
                    <button title="Remove choice"
                      onClick={() => {
                        const choices = i.choices.filter((_, k) => k !== idx);
                        // Keep answerIndex pointing at the SAME choice after a removal.
                        const answerIndex = i.answerIndex === idx ? 0
                          : i.answerIndex > idx ? i.answerIndex - 1 : i.answerIndex;
                        set({ choices, answerIndex });
                      }}
                      className="p-1.5 rounded hover:bg-red-500/15 text-red-400"><X className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
            </div>
            {i.choices.length < 6 && (
              <button onClick={() => set({ choices: [...i.choices, ""] })}
                className="mt-1.5 text-[11px] text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> add choice
              </button>
            )}
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Explanation (shown after answering)</label>
            <textarea value={i.explanation ?? ""} onChange={(e) => set({ explanation: e.target.value })} rows={2}
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm resize-y" />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="accent-primary" checked={i.active ?? true}
              onChange={(e) => set({ active: e.target.checked })} />
            Visible to members
          </label>

          {err && <div className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {err}</div>}
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center gap-2">
          <button onClick={() => setState(null)} className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-sm">Cancel</button>
          <button onClick={onSave} disabled={saving}
            className="ml-auto px-4 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

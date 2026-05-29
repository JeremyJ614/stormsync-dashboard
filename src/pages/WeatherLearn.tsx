import { useState } from "react";
import type { Location } from "../hooks/useLocation";
import { BookOpen, CheckCircle, XCircle, RefreshCw, Lightbulb } from "lucide-react";
import { BASE_API } from "../config";

interface Props { location: Location }

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

const TOPICS = [
  { id: "tornadoes", label: "🌪️ Tornadoes", desc: "Formation, safety, and detection" },
  { id: "thunderstorms", label: "⛈️ Thunderstorms", desc: "Types, structure, and hazards" },
  { id: "hurricanes", label: "🌀 Hurricanes", desc: "Development, intensity, and impacts" },
  { id: "winter-weather", label: "❄️ Winter Weather", desc: "Snow, ice, and cold events" },
  { id: "atmospheric-instability", label: "⚡ Instability", desc: "CAPE, LI, and convective parameters" },
  { id: "radar-interpretation", label: "📡 Radar", desc: "Reading weather radar products" },
  { id: "fronts-pressure-systems", label: "🌊 Fronts & Pressure", desc: "Synoptic-scale features" },
  { id: "wind-shear", label: "💨 Wind Shear", desc: "SRH, shear vectors, and storm motion" },
];

const DIFFICULTIES = ["beginner", "intermediate", "advanced"];

const ARTICLES: Record<string, { title: string; content: string }> = {
  tornadoes: {
    title: "Understanding Tornadoes",
    content: `Tornadoes are violently rotating columns of air extending from a thunderstorm to the ground. They form within supercell thunderstorms that have strong rotating updrafts called mesocyclones.

**Key Ingredients:**
- Atmospheric instability (CAPE > 1000 J/kg)
- Wind shear — both speed and directional shear
- A lifting mechanism (front, dryline, outflow boundary)
- Low-level moisture (high dew points)

**The 0-3km SRH** is critical — values above 150 m²/s² indicate potential for rotating storms, while values above 300 m²/s² suggest a significant tornado threat.

**Tornado Types:**
- Landspout: Forms from the ground up, no supercell required
- Waterspout: Same as above but over water
- Supercell tornado: Most dangerous, forms from mesocyclone
- QLCS tornado: Brief, from squall lines

**The EF Scale rates damage from EF0 (65-85 mph) to EF5 (>200 mph).**

Safety: When a tornado warning is issued, move to the lowest floor interior room away from windows. Mobile homes are unsafe in any tornado.`,
  },
  thunderstorms: {
    title: "Thunderstorm Basics",
    content: `Thunderstorms require three ingredients: moisture, instability, and a lifting mechanism.

**Storm Types:**
- Single-cell: Brief, weakly organized
- Multi-cell: Cluster of storms at different stages
- Squall line (QLCS): Linear storm system, widespread damaging winds
- Supercell: Rotating thunderstorm, most likely to produce tornadoes and large hail

**Hazards by category:**
- Lightning: Kills more people annually than tornadoes
- Damaging winds: Most common severe thunderstorm hazard
- Large hail: Correlates with strong updrafts (VIL > 50 kg/m²)
- Flash flooding: "Turn Around, Don't Drown"
- Tornadoes: From supercells and QLCS systems

**Reading the atmosphere:**
CAPE tells you energy, LI tells you instability, SRH tells you rotation potential, and shear tells you storm organization.`,
  },
  "atmospheric-instability": {
    title: "Atmospheric Instability",
    content: `Instability drives convection. The more unstable the atmosphere, the more explosive thunderstorm development can be.

**CAPE (Convective Available Potential Energy):**
- 0-500 J/kg: Marginal instability
- 500-1500 J/kg: Moderate instability
- 1500-3000 J/kg: Large instability
- >3000 J/kg: Extreme instability

**Lifted Index (LI):**
- Positive: Stable, unlikely to convect
- 0 to -2: Slightly unstable
- -2 to -4: Unstable
- < -6: Very unstable

**CAPE ingredients:**
1. Low-level moisture (high dew points)
2. Mid-level dryness (dry air aloft increases lapse rates)
3. Steep temperature lapse rates

**The cap:** CIN (Convective Inhibition) acts as a lid suppressing storms. A moderate cap allows CAPE to build. When the cap breaks, explosive convective development occurs.`,
  },
  "radar-interpretation": {
    title: "Reading Weather Radar",
    content: `Radar sends microwave pulses that bounce off precipitation and return data about intensity, motion, and type.

**Reflectivity (dBZ):**
- < 20 dBZ: Light rain or drizzle
- 20-40 dBZ: Moderate rain
- 40-50 dBZ: Heavy rain, possible hail
- 50-60 dBZ: Very heavy rain, hail likely
- > 60 dBZ: Extreme — large hail

**Velocity products:**
- Green: Moving toward radar
- Red: Moving away from radar
- Tight couplet (green next to red): Rotation!

**Special signatures:**
- Hook echo: Classic supercell/tornado signature
- BWER (Bounded Weak Echo Region): Strong updraft, hail
- Bow echo: Damaging winds along leading edge
- Three-body scatter spike: Giant hail in progress

**Remember:** Radar shows precipitation, not tornadoes directly. Use velocity products to identify rotation.`,
  },
};

export default function WeatherLearn({ location }: Props) {
  const [view, setView] = useState<"home" | "article" | "quiz">("home");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState("intermediate");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const startQuiz = async (topicId: string) => {
    setLoading(true);
    setError(null);
    setQuestions([]);
    setCurrentQ(0);
    setSelected(null);
    setAnswered(false);
    setScore(0);
    setDone(false);
    setSelectedTopic(topicId);
    try {
      const res = await fetch(`${BASE_API}/ai/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: TOPICS.find(t => t.id === topicId)?.label.replace(/[^\w\s]/g, "").trim() ?? topicId, difficulty }),
      });
      if (!res.ok) throw new Error("Could not generate quiz");
      const data = await res.json() as { questions: QuizQuestion[] };
      if (!data.questions?.length) throw new Error("No questions returned");
      setQuestions(data.questions);
      setView("quiz");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quiz generation failed");
    } finally {
      setLoading(false);
    }
  };

  const answer = (idx: number) => {
    if (answered) return;
    setSelected(idx);
    setAnswered(true);
    if (idx === questions[currentQ]?.correct) setScore(s => s + 1);
  };

  const nextQ = () => {
    if (currentQ + 1 >= questions.length) {
      setDone(true);
    } else {
      setCurrentQ(q => q + 1);
      setSelected(null);
      setAnswered(false);
    }
  };

  const article = selectedTopic ? ARTICLES[selectedTopic] : null;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Weather Learn</h2>
      </div>
      <p className="text-sm text-muted-foreground">Interactive meteorology education</p>

      {view === "home" && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium">Quiz Difficulty:</span>
            <div className="flex gap-1">
              {DIFFICULTIES.map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${difficulty === d ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:border-primary/40"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive rounded-xl p-3 text-sm text-destructive">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TOPICS.map(topic => (
              <div key={topic.id} className="bg-card border border-border rounded-xl p-4">
                <div className="font-semibold mb-1">{topic.label}</div>
                <div className="text-xs text-muted-foreground mb-3">{topic.desc}</div>
                <div className="flex gap-2">
                  {ARTICLES[topic.id] && (
                    <button
                      onClick={() => { setSelectedTopic(topic.id); setView("article"); }}
                      className="flex-1 px-3 py-1.5 text-xs bg-muted/30 hover:bg-muted/50 rounded transition-colors flex items-center justify-center gap-1"
                    >
                      <Lightbulb className="w-3 h-3" />
                      Read
                    </button>
                  )}
                  <button
                    onClick={() => startQuiz(topic.id)}
                    disabled={loading}
                    className="flex-1 px-3 py-1.5 text-xs bg-primary/15 text-primary border border-primary/30 rounded hover:bg-primary/25 transition-colors disabled:opacity-50"
                  >
                    {loading && selectedTopic === topic.id ? "Loading…" : "Quiz Me"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "article" && article && (
        <div className="space-y-4">
          <button onClick={() => setView("home")} className="text-sm text-primary hover:underline">← Back</button>
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-lg font-bold mb-4">{article.title}</h3>
            <div className="prose prose-sm prose-invert max-w-none">
              {article.content.split("\n\n").map((para, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground mb-3">
                  {para.split("**").map((part, j) =>
                    j % 2 === 1 ? <strong key={j} className="text-foreground">{part}</strong> : part
                  )}
                </p>
              ))}
            </div>
          </div>
          {selectedTopic && (
            <button
              onClick={() => startQuiz(selectedTopic)}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Take the Quiz
            </button>
          )}
        </div>
      )}

      {view === "quiz" && (
        <div className="space-y-4">
          <button onClick={() => setView("home")} className="text-sm text-primary hover:underline">← Back to topics</button>

          {done ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <div className="text-5xl mb-4">{score >= questions.length * 0.8 ? "🏆" : score >= questions.length * 0.5 ? "👍" : "📚"}</div>
              <h3 className="text-xl font-bold mb-2">Quiz Complete!</h3>
              <p className="text-3xl font-bold text-primary mb-2">{score}/{questions.length}</p>
              <p className="text-sm text-muted-foreground mb-6">
                {score === questions.length ? "Perfect score!" : score >= questions.length * 0.8 ? "Great job!" : score >= questions.length * 0.5 ? "Good effort!" : "Keep studying!"}
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => selectedTopic && startQuiz(selectedTopic)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try Again
                </button>
                <button
                  onClick={() => setView("home")}
                  className="px-4 py-2 bg-card border border-border rounded-lg text-sm hover:border-primary/40 transition-colors"
                >
                  Choose Topic
                </button>
              </div>
            </div>
          ) : questions.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Question {currentQ + 1} of {questions.length}</span>
                <span className="font-medium">Score: {score}/{currentQ}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full">
                <div className="h-1.5 bg-primary rounded-full transition-all" style={{ width: `${((currentQ) / questions.length) * 100}%` }} />
              </div>

              <div className="bg-card border border-border rounded-xl p-5">
                <p className="font-semibold mb-4">{questions[currentQ].question}</p>
                <div className="space-y-2">
                  {questions[currentQ].options.map((opt, i) => {
                    let cls = "bg-muted/20 hover:bg-muted/40 border-border";
                    if (answered) {
                      if (i === questions[currentQ].correct) cls = "bg-green-500/15 border-green-500";
                      else if (i === selected) cls = "bg-red-500/15 border-red-500";
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => answer(i)}
                        disabled={answered}
                        className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${cls}`}
                      >
                        <span className="font-medium mr-2">{["A", "B", "C", "D"][i]}.</span>
                        {opt}
                        {answered && i === questions[currentQ].correct && <CheckCircle className="inline-block w-4 h-4 ml-2 text-green-400" />}
                        {answered && i === selected && i !== questions[currentQ].correct && <XCircle className="inline-block w-4 h-4 ml-2 text-red-400" />}
                      </button>
                    );
                  })}
                </div>

                {answered && (
                  <div className="mt-4 p-3 bg-muted/20 rounded-lg">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Explanation</div>
                    <p className="text-sm text-muted-foreground">{questions[currentQ].explanation}</p>
                    <button
                      onClick={nextQ}
                      className="mt-3 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 transition-opacity"
                    >
                      {currentQ + 1 >= questions.length ? "See Results" : "Next Question →"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

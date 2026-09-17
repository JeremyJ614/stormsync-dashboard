/**
 * The account half of signing up — name, email, PIN, plus whatever questions
 * the admin panel has added. Lives on its own so the unified join page and the
 * login page can render the same fields without duplicating validation.
 *
 * The PIN is one real <input> sitting transparently over four display cells:
 * a genuine input keeps paste, autofill, password managers and the numeric
 * keypad working, while the cells give it the shape of a passcode entry.
 *
 * Every `QuestionType` the admin panel can produce is rendered with its real
 * control here — a `date` question must get the native date picker, not a bare
 * text box, or the member is left guessing at a format.
 */
import { motion } from "framer-motion";
import { Lock, Mail, User as UserIcon } from "lucide-react";
import type { QuestionType, SignupQuestion } from "../../hooks/useAuth";
import { ROYAL, EASE } from "../../lib/royal";

const FIELD =
  "w-full bg-[hsl(var(--muted)/0.35)] border rounded-lg px-3 py-2.5 text-sm outline-none " +
  "transition-colors focus:border-[rgba(217,183,117,0.55)] focus:bg-[hsl(var(--muted)/0.5)]";

// `color-scheme: dark` is what makes Chrome/Safari draw the native date and
// time pickers (and their calendar glyph) in dark trim instead of a white
// panel with an invisible black icon on our dark ground.
const FIELD_STYLE: React.CSSProperties = { borderColor: "hsl(var(--border))", colorScheme: "dark" };

function Label({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-[0.18em] flex items-center gap-1.5 mb-1.5"
          style={{ color: ROYAL.dim }}>
      {Icon && <Icon className="w-3 h-3" style={{ color: ROYAL.gold }} />}
      {children}
    </span>
  );
}

export function PinField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <Label icon={Lock}>4-Digit PIN</Label>
      <div className="relative">
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => {
            const filled = value.length > i;
            const isNext = value.length === i;
            return (
              <div
                key={i}
                className="h-12 rounded-lg border flex items-center justify-center text-xl font-bold"
                style={{
                  borderColor: isNext ? "rgba(217,183,117,0.55)" : "hsl(var(--border))",
                  background: filled ? "rgba(217,183,117,0.08)" : "hsl(var(--muted)/0.32)",
                  color: ROYAL.text,
                  boxShadow: isNext ? `0 0 0 3px rgba(217,183,117,0.10)` : "none",
                  transition: "border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease",
                }}
              >
                {filled && (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 520, damping: 22 }}
                  >
                    •
                  </motion.span>
                )}
              </div>
            );
          })}
        </div>
        {/* The real control — transparent, but fully functional. */}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
          required type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
          autoComplete="one-time-code" aria-label="4-digit PIN"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </label>
  );
}

/** Maps an admin question type onto the HTML input type that actually has the
 *  right keyboard and picker on a phone. */
function inputTypeFor(t: QuestionType): string {
  switch (t) {
    case "date": return "date";
    case "email": return "email";
    case "tel": return "tel";
    case "number": return "number";
    default: return "text";
  }
}

export function CustomQuestionField({
  q, value, onChange,
}: { q: SignupQuestion; value: string; onChange: (v: string) => void }) {
  if (q.type === "checkbox") {
    const checked = value === "yes";
    return (
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={checked} required={q.required}
               onChange={(e) => onChange(e.target.checked ? "yes" : "")}
               className="mt-0.5 w-4 h-4 shrink-0 accent-[#d9b775]" style={{ colorScheme: "dark" }} />
        <span className="text-[12px] leading-snug" style={{ color: ROYAL.dim }}>
          {q.label}{q.required ? " *" : ""}
        </span>
      </label>
    );
  }

  return (
    <label className="block">
      <Label>{q.label}{q.required ? " *" : ""}</Label>
      {q.type === "textarea" ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} required={q.required}
                  placeholder={q.placeholder} rows={3}
                  className={`${FIELD} resize-none`} style={FIELD_STYLE} />
      ) : q.type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} required={q.required}
                className={FIELD} style={FIELD_STYLE}>
          <option value="">Select…</option>
          {(q.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} required={q.required}
               placeholder={q.placeholder} type={inputTypeFor(q.type)}
               inputMode={q.type === "tel" ? "tel" : undefined}
               className={FIELD} style={FIELD_STYLE} />
      )}
    </label>
  );
}

export function AccountFields({
  name, email, pin, answers, questions,
  onName, onEmail, onPin, onAnswer,
}: {
  name: string; email: string; pin: string;
  answers: Record<string, string>; questions: SignupQuestion[];
  onName: (v: string) => void; onEmail: (v: string) => void;
  onPin: (v: string) => void; onAnswer: (id: string, v: string) => void;
}) {
  const rows = [
    <label className="block" key="name">
      <Label icon={UserIcon}>Full name</Label>
      <input value={name} onChange={(e) => onName(e.target.value)} required type="text"
             autoComplete="name" className={FIELD} style={FIELD_STYLE} />
    </label>,
    <label className="block" key="email">
      <Label icon={Mail}>Email</Label>
      <input value={email} onChange={(e) => onEmail(e.target.value)} required type="email"
             autoComplete="email" className={FIELD} style={FIELD_STYLE} />
    </label>,
    <PinField key="pin" value={pin} onChange={onPin} />,
    ...questions.map((q) => (
      <CustomQuestionField key={q.id} q={q} value={answers[q.id] ?? ""} onChange={(v) => onAnswer(q.id, v)} />
    )),
  ];

  return (
    <div className="space-y-3.5">
      {rows.map((row, i) => (
        <motion.div
          key={row.key ?? i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 + i * 0.05, duration: 0.4, ease: EASE }}
        >
          {row}
        </motion.div>
      ))}
    </div>
  );
}

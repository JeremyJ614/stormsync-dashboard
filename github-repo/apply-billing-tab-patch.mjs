#!/usr/bin/env node
import fs from "node:fs";

const path = "src/pages/AdminPanel.tsx";
let content = fs.readFileSync(path, "utf8");
let allOk = true;

function replaceOnce(label, from, to) {
  if (!content.includes(from)) {
    console.error(`x SKIPPED: ${label} -- couldn't find the expected text (may already be applied, or the file changed since this patch was written).`);
    allOk = false;
    return;
  }
  content = content.replace(from, to);
  console.log(`OK: ${label}`);
}

replaceOnce(
  "1/5 Import AdminBillingTab component",
  `import { BadgeChip } from "../components/BadgeChip";`,
  `import { BadgeChip } from "../components/BadgeChip";\nimport AdminBillingTab from "../components/AdminBillingTab";`
);

replaceOnce(
  "2/5 Add DollarSign to icon imports",
  `import { Shield, Users, Bell, BellRing, Mail, MessageSquare, Phone, MapPin, Newspaper, Settings, Trash2, Plus, Check, AlertTriangle, Award, UserPlus, X, KeyRound, Loader2, ClipboardList, Pencil, ArrowUp, ArrowDown, HelpCircle, Pin, PinOff, Eye, EyeOff, Calendar, Tag, FileText, Clock, Save, Bold, Italic, Strikethrough, Heading2, Heading3, List, ListOrdered, Quote, Code, Link2, Image as ImageIcon, Minus } from "lucide-react";`,
  `import { Shield, Users, Bell, BellRing, Mail, MessageSquare, Phone, MapPin, Newspaper, DollarSign, Settings, Trash2, Plus, Check, AlertTriangle, Award, UserPlus, X, KeyRound, Loader2, ClipboardList, Pencil, ArrowUp, ArrowDown, HelpCircle, Pin, PinOff, Eye, EyeOff, Calendar, Tag, FileText, Clock, Save, Bold, Italic, Strikethrough, Heading2, Heading3, List, ListOrdered, Quote, Code, Link2, Image as ImageIcon, Minus } from "lucide-react";`
);

replaceOnce(
  "3/5 Add 'billing' to the Tab type",
  `type Tab = "users" | "modules" | "badges" | "signups" | "broadcasts" | "inbox" | "alerts" | "news" | "faq" | "settings";`,
  `type Tab = "users" | "modules" | "badges" | "signups" | "broadcasts" | "inbox" | "alerts" | "news" | "faq" | "billing" | "settings";`
);

replaceOnce(
  "4/5 Add Billing button to the tab bar",
  `          { id: "faq", label: "FAQ & Guide", icon: HelpCircle },\n          { id: "settings", label: "Settings", icon: Settings },`,
  `          { id: "faq", label: "FAQ & Guide", icon: HelpCircle },\n          { id: "billing", label: "Billing", icon: DollarSign },\n          { id: "settings", label: "Settings", icon: Settings },`
);

replaceOnce(
  "5/5 Render the Billing tab content",
  `      {tab === "faq" && <FaqTab />}\n      {tab === "settings" && <SettingsTab />}`,
  `      {tab === "faq" && <FaqTab />}\n      {tab === "billing" && <AdminBillingTab />}\n      {tab === "settings" && <SettingsTab />}`
);

if (allOk) {
  fs.writeFileSync(path, content, "utf8");
  console.log("\nAll 5 edits applied successfully to " + path);
} else {
  console.error("\nNothing was written -- fix the issue above (or paste what this printed back to Claude) and re-run.");
  process.exit(1);
}

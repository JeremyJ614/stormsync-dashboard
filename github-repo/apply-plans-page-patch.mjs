#!/usr/bin/env node
import fs from "node:fs";

let allOk = true;

function patchFile(path, edits) {
  let content = fs.readFileSync(path, "utf8");
  for (const [label, from, to] of edits) {
    if (!content.includes(from)) {
      console.error(`x SKIPPED (${path}): ${label} -- couldn't find the expected text.`);
      allOk = false;
      continue;
    }
    content = content.replace(from, to);
    console.log(`OK (${path}): ${label}`);
  }
  fs.writeFileSync(path, content, "utf8");
}

patchFile("src/App.tsx", [
  [
    "1/2 Lazy-import the Plans page",
    `const AdminPanel = lazy(() => import("./pages/AdminPanel"));`,
    `const AdminPanel = lazy(() => import("./pages/AdminPanel"));\nconst Plans = lazy(() => import("./pages/Plans"));`,
  ],
  [
    "2/2 Add the /plans route",
    `        <Route path="/contact" component={() => <PW name="Contact"><Contact /></PW>} />`,
    `        <Route path="/contact" component={() => <PW name="Contact"><Contact /></PW>} />\n        <Route path="/plans" component={() => <PW name="Plans"><Plans /></PW>} />`,
  ],
]);

patchFile("src/pages/Login.tsx", [
  [
    "1/2 Send new signups to /plans instead of the dashboard",
    `        const r = await signup({ name, email, pin, customAnswers });\n        if (!r.ok) { setError(r.error || "Signup failed"); return; }\n        // Accounts are created already-confirmed and signed in immediately.\n        navigate("/");`,
    `        const r = await signup({ name, email, pin, customAnswers });\n        if (!r.ok) { setError(r.error || "Signup failed"); return; }\n        // Accounts are created already-confirmed and signed in immediately.\n        navigate("/plans");`,
  ],
  [
    "2/2 Update the signup helper text",
    `          {mode === "signup" && (\n            <p className="text-[10px] text-muted-foreground leading-relaxed">\n              New accounts start at <strong className="text-foreground">Tier 1</strong>. Your tier is\n              upgraded by a StormSync admin after your membership is set up.\n            </p>\n          )}`,
    `          {mode === "signup" && (\n            <p className="text-[10px] text-muted-foreground leading-relaxed">\n              Next, you'll pick your plan and modules — free tiers complete instantly.\n            </p>\n          )}`,
  ],
]);

if (allOk) {
  console.log("\nAll edits applied successfully.");
} else {
  console.error("\nSome edits were skipped -- see above. Paste that output back to Claude before pushing.");
  process.exit(1);
}

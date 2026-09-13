#!/usr/bin/env bash
# Ungated production build, for looking at modules that normally sit behind auth.
#
# Patches `Gated` to pass everything through, builds into dist-test, and puts
# App.tsx straight back — the revert runs on EXIT so an interrupted build cannot
# leave the gate open in the working tree.
set -euo pipefail
cd "$(dirname "$0")"
cp src/App.tsx /tmp/App.tsx.orig
cp src/hooks/useAuth.ts /tmp/useAuth.ts.orig
trap 'cp /tmp/App.tsx.orig src/App.tsx; cp /tmp/useAuth.ts.orig src/hooks/useAuth.ts' EXIT
python3 - <<'PY'
p='src/App.tsx'; s=open(p).read()
old='''  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  if (!hasModuleAccess(user, path)) return <ModuleUpsell path={path} signedIn={!!user} />;
  return <>{children}</>;'''
new='''  void path; void useAuth; void hasModuleAccess; void ModuleUpsell; void PageSkeleton;
  return <>{children}</>;'''
assert old in s, "Gated body moved - update build-test.sh"
s = s.replace(old, new)
open(p,'w').write(s)

# Unlock every module too, so pages that branch on entitlement (the dashboard
# wall) can be looked at as a paying member sees them.
p2 = 'src/hooks/useAuth.ts'
s2 = open(p2).read()
anchor = 'export function hasModuleAccess(user: User | null, path: string): boolean {'
assert anchor in s2, "hasModuleAccess moved - update build-test.sh"
open(p2, 'w').write(s2.replace(anchor, anchor + '\n  if (path) return true;   // build-test.sh: ungated preview', 1))
PY
npx vite build --outDir dist-test --emptyOutDir

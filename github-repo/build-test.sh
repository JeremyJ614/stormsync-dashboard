#!/usr/bin/env bash
# Ungated production build, for looking at modules that normally sit behind auth.
#
# Patches `Gated` to pass everything through, builds into dist-test, and puts
# App.tsx straight back — the revert runs on EXIT so an interrupted build cannot
# leave the gate open in the working tree.
set -euo pipefail
cd "$(dirname "$0")"
cp src/App.tsx /tmp/App.tsx.orig
trap 'cp /tmp/App.tsx.orig src/App.tsx' EXIT
python3 - <<'PY'
p='src/App.tsx'; s=open(p).read()
old='''  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  if (!hasModuleAccess(user, path)) return <ModuleUpsell path={path} signedIn={!!user} />;
  return <>{children}</>;'''
new='''  void path; void useAuth; void hasModuleAccess; void ModuleUpsell; void PageSkeleton;
  return <>{children}</>;'''
assert old in s, "Gated body moved - update build-test.sh"
open(p,'w').write(s.replace(old,new))
PY
npx vite build --outDir dist-test --emptyOutDir

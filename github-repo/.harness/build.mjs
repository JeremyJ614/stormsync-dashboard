import * as esbuild from 'esbuild';
import path from 'node:path';
const R = path.resolve(process.argv[2]);
await esbuild.build({
  entryPoints: [path.join(R, '.harness/entry.tsx')],
  outfile: process.argv[3], bundle: true, jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"',
    'import.meta.env': JSON.stringify({ MODE:'development', DEV:true, PROD:false,
      VITE_SUPABASE_URL: process.argv[4] || 'http://localhost:5470',
      VITE_SUPABASE_ANON_KEY:'none', BASE_URL:'/' }) },
});
console.log('built');

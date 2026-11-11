import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({ entryPoints: [fileURLToPath(new URL('core.ts', import.meta.url))], outfile: fileURLToPath(new URL('core.mjs', import.meta.url)), bundle: true, platform: 'node', format: 'esm', target: 'node22', nodePaths: [fileURLToPath(new URL('node_modules', import.meta.url))] });

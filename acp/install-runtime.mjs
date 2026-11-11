// Install the dependency-free ACP runtime outside the source checkout.
import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const directory = join(homedir(), 'Library/Application Support/LearnHarness Personal/acp/runtime');
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
for (const file of ['bridge.mjs', 'core.mjs']) {
  const source = await fs.readFile(new URL(file, import.meta.url));
  const target = join(directory, file);
  await fs.writeFile(target + '.new', source, { mode: 0o600 });
  await fs.rename(target + '.new', target);
}
console.log(join(directory, 'bridge.mjs'));

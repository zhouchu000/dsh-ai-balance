import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const result = await build({ entryPoints: [join(root, 'src/client/index.js')], bundle: true, write: false,
  platform: 'browser', format: 'cjs', target: ['chrome120'], external: ['react', 'react-dom'], minify: false, legalComments: 'none' });
await mkdir(join(root, 'lib'), { recursive: true });
await writeFile(join(root, 'lib/client.js'), `window.__ModuleLoader__.load({id:"dsh-ai-balance",factory:function(require){var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`);
console.log('Cross-platform DSH client built.');

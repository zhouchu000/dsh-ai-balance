import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootFiles = new Set(['package.json', 'package-lock.json', 'cordis.patch.yml', 'README.md', 'LICENSE',
  'THIRD_PARTY_NOTICES.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'REVIEW.md', '.gitignore', '.gitattributes']);
const rootDirs = new Set(['src', 'lib', 'scripts', 'test', '.github']);
const excludedRoots = new Set(['node_modules', '.git']);
const removedManagement = /KeyProvisioner|configureKey|autoCreateApiKey|keyStates|\/api\/v1\/apiKeys|key-(?:connect|rollback)|DSH_MIMO_KEY_|apiKeyEnv|mimo-balance__keys|API[ _-]*Key/i;

/** Source/archive allowlist inspection. Findings never include matched secret values. */
export async function inspectRelease(root) {
  const files = [], findings = [];
  const finding = (file, kind) => findings.push({ file, kind });
  async function walk(relative = '') {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const file = relative ? relative + '/' + entry.name : entry.name;
      if (!relative && excludedRoots.has(entry.name)) continue;
      if (entry.isSymbolicLink()) { finding(file, 'symlink'); continue; }
      if (!relative && !(entry.isDirectory() ? rootDirs : rootFiles).has(entry.name)) { finding(file, 'unexpected-path'); continue; }
      if (/(?:^|\/)(?:\.env(?:\..*)?|\.credentials.*|balance\.json|cache|private|work|native)(?:\/|$)/i.test(file)) { finding(file, 'private-path'); continue; }
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile()) { finding(file, 'unsupported-file'); continue; }
      if (relative && !['.js', '.mjs', '.json', '.md', '.yml', '.yaml'].includes(extname(entry.name))) {
        finding(file, 'unexpected-filetype'); continue;
      }
      files.push(file);
      const text = await readFile(join(root, file), 'utf8');
      if (/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/.test(text)) finding(file, 'private-key');
      if (/\/(?:Users|home)\/[A-Za-z0-9._-]+\//.test(text) || /[A-Z]:[\\/]Users[\\/][A-Za-z0-9._-]+[\\/]/i.test(text)) finding(file, 'personal-path');
      if (/sk-[A-Za-z0-9_-]{24,}|Bearer\s+[A-Za-z0-9._-]{24,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(text)) finding(file, 'credential-pattern');
      for (const match of text.matchAll(/api-platform_(?:serviceToken|ph|slh)=([^\s;'"`\\]+)/g)) {
        if (!file.startsWith('test/') || !match[1].startsWith('fixture')) { finding(file, 'console-credential'); break; }
      }
      if (/^(?:src|lib)\//.test(file) && (removedManagement.test(text) || /(?:^|\/)(?:key-api|key-provision|rollback-key)\./.test(file))) finding(file, 'removed-management');
    }
  }
  await walk();
  for (const required of ['package.json', 'package-lock.json', 'cordis.patch.yml', 'README.md', 'LICENSE', 'src/index.js', 'lib/client.js']) {
    if (!files.includes(required)) finding(required, 'missing-required-file');
  }
  return { files: files.sort(), findings };
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('..', import.meta.url));
  const result = await inspectRelease(root);
  console.log(JSON.stringify({ publicFiles: result.files.length, findings: result.findings }, null, 2));
  if (result.findings.length) process.exitCode = 1;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mimo-public-'));
  await mkdir(join(root, 'src')); await mkdir(join(root, 'lib'));
  for (const [name, text] of Object.entries({ 'package.json': '{"name":"dsh-ai-balance"}', 'package-lock.json': '{}',
    'README.md': 'Anonymous public documentation', LICENSE: 'MIT', 'cordis.patch.yml': '[]', 'src/index.js': 'export const apply = () => {};',
    'lib/client.js': '/* anonymous generated client */' })) await writeFile(join(root, name), text);
  return root;
}
test('release inspection accepts public sources and excludes installed dependencies from delivery', async () => {
  const { inspectRelease } = await import('../scripts/check-release.mjs');
  const root = await fixture();
  try {
    await mkdir(join(root, 'node_modules')); await writeFile(join(root, 'node_modules/private-local-file'), 'not distributed');
    const result = await inspectRelease(root);
    assert.deepEqual(result.findings, []); assert.equal(result.files.some(name => name.startsWith('node_modules/')), false);
    assert.ok(result.files.includes('lib/client.js'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('release inspection rejects credentials, personal paths and obsolete management behavior', async () => {
  const { inspectRelease } = await import('../scripts/check-release.mjs');
  const root = await fixture();
  try {
    const leak = 'api-platform_' + 'serviceToken=' + 'synthetic-leaked-value';
    await writeFile(join(root, 'src/index.js'), `// ${leak}\nconst path=${JSON.stringify('/Users/' + 'fixture-person' + '/.dsh')};\nconst configure` + 'Key = () => {};');
    await writeFile(join(root, '.env'), 'private=true');
    const { findings } = await inspectRelease(root);
    for (const kind of ['console-credential', 'personal-path', 'removed-management', 'unexpected-path']) assert.ok(findings.some(x => x.kind === kind), kind);
    assert.ok(!JSON.stringify(findings).includes('synthetic-leaked-value'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('release inspection refuses symlinks that could package files outside the project', async () => {
  const { inspectRelease } = await import('../scripts/check-release.mjs');
  const root = await fixture(), outside = await mkdtemp(join(tmpdir(), 'mimo-outside-'));
  try {
    // Directory junctions work without Administrator/developer-mode privileges on Windows.
    await symlink(outside, join(root, 'src/external'), process.platform === 'win32' ? 'junction' : 'dir');
    const { findings } = await inspectRelease(root);
    assert.ok(findings.some(x => x.kind === 'symlink'));
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
test('release inspection rejects private-key material and unexpected file types inside approved directories', async () => {
  const { inspectRelease } = await import('../scripts/check-release.mjs');
  const root = await fixture();
  try {
    const marker = '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----';
    await writeFile(join(root, 'src/connection.pem'), marker + '\nanonymous fixture only\n');
    await writeFile(join(root, 'src/debug.js'), '// ' + marker + '\nanonymous fixture only\n');
    const { files, findings } = await inspectRelease(root);
    assert.ok(findings.some(x => x.kind === 'private-key'));
    assert.ok(findings.some(x => x.kind === 'unexpected-filetype'));
    assert.equal(files.includes('src/connection.pem'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

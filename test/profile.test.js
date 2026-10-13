import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

test('additive fallback installation/uninstallation preserves other dependencies, bundles and later edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mimo-profile-'));
  try {
    await mkdir(join(directory, 'node_modules'));
    const original = { name: 'profile', private: true, dependencies: { 'existing-ui': '1.2.3' },
      dsh: { profile: { bundles: ['base', 'existing-ui'] } } };
    const file = join(directory, 'package.json'); await writeFile(file, JSON.stringify(original));
    await run(process.execPath, ['scripts/profile.mjs', 'install', '--profile', directory]);
    const installed = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(installed.dependencies['existing-ui'], '1.2.3');
    assert.deepEqual(installed.dsh.profile.bundles, ['base', 'existing-ui', 'dsh-ai-balance']);
    assert.equal((await lstat(join(directory, 'node_modules/dsh-ai-balance'))).isSymbolicLink(), true);
    installed.dependencies.later = '4.5.6'; installed.dsh.profile.bundles.push('later');
    await writeFile(file, JSON.stringify(installed));
    await run(process.execPath, ['scripts/profile.mjs', 'uninstall', '--profile', directory]);
    const removed = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(removed.dependencies, { 'existing-ui': '1.2.3', later: '4.5.6' });
    assert.deepEqual(removed.dsh.profile.bundles, ['base', 'existing-ui', 'later']);
    await assert.rejects(lstat(join(directory, 'node_modules/dsh-ai-balance')), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('upgrade disables the old bundle while preserving unrelated entries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-upgrade-'));
  try {
    const file = join(directory, 'package.json');
    await writeFile(file, JSON.stringify({ dependencies: { 'dsh-mimo-balance': 'link:/old-source', other: '1' }, dsh: { profile: { bundles: ['dsh-mimo-balance', 'other'] } } }));
    await run(process.execPath, ['scripts/profile.mjs', 'install', '--profile', directory]);
    const next = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(next.dependencies['dsh-mimo-balance'], undefined);
    assert.deepEqual(next.dsh.profile.bundles, ['other', 'dsh-ai-balance']);
    assert.equal(next.dependencies.other, '1');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

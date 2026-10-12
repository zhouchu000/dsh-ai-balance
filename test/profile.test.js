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
    assert.deepEqual(installed.dsh.profile.bundles, ['base', 'existing-ui', 'dsh-mimo-balance']);
    assert.equal((await lstat(join(directory, 'node_modules/dsh-mimo-balance'))).isSymbolicLink(), true);
    installed.dependencies.later = '4.5.6'; installed.dsh.profile.bundles.push('later');
    await writeFile(file, JSON.stringify(installed));
    await run(process.execPath, ['scripts/profile.mjs', 'uninstall', '--profile', directory]);
    const removed = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(removed.dependencies, { 'existing-ui': '1.2.3', later: '4.5.6' });
    assert.deepEqual(removed.dsh.profile.bundles, ['base', 'existing-ui', 'later']);
    await assert.rejects(lstat(join(directory, 'node_modules/dsh-mimo-balance')), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

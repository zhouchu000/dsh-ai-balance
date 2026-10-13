import { readFile, writeFile, open, mkdir, lstat, stat, readlink, symlink, unlink, rename, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve, isAbsolute } from 'node:path';
const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2); const action = args[0];
const profileIndex = args.indexOf('--profile');
const profile = profileIndex >= 0 ? args[profileIndex + 1] : join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles/desktop');
if (!['install', 'uninstall'].includes(action) || !profile || !isAbsolute(profile)) throw new Error('Usage: node scripts/profile.mjs install|uninstall [--profile /absolute/profile]');
const name = 'dsh-ai-balance', spec = 'link:' + packageRoot;
const manifest = join(profile, 'package.json'), link = join(profile, 'node_modules', name), lock = join(profile, '.ai-balance-install.lock');
const lockHandle = await open(lock, 'wx', 0o600);
let madeLink = false;
try {
  const original = await readFile(manifest, 'utf8'); const data = JSON.parse(original);
  const permissions = (await stat(manifest)).mode & 0o777;
  const existing = data.dependencies?.[name];
  let linkTarget = null;
  try {
    const info = await lstat(link);
    if (!info.isSymbolicLink()) throw new Error('An existing real plugin directory must be managed through the DeepSeek Harness plugin UI.');
    linkTarget = resolve(await readlink(link));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if ((existing && existing !== spec) || (linkTarget && linkTarget !== packageRoot)) throw new Error('A different balance plugin installation already exists; nothing changed.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backups = join(profile, '.ai-balance-backups'); await mkdir(backups, { recursive: true, mode: 0o700 });
  await copyFile(manifest, join(backups, `${stamp}-${action}-package.json`));
  if (action === 'install') {
    await stat(join(packageRoot, 'lib/client.js'));
    data.dependencies ??= {}; delete data.dependencies['dsh-mimo-balance']; data.dependencies[name] = spec;
    data.dsh ??= {}; data.dsh.profile ??= {}; data.dsh.profile.bundles ??= [];
    if (!Array.isArray(data.dsh.profile.bundles)) throw new Error('Existing bundle configuration is invalid; nothing changed.');
    data.dsh.profile.bundles = data.dsh.profile.bundles.filter(id => id !== 'dsh-mimo-balance');
    if (!data.dsh.profile.bundles.includes(name)) data.dsh.profile.bundles.push(name);
    if (!linkTarget) { await mkdir(join(profile, 'node_modules'), { recursive: true }); await symlink(packageRoot, link, process.platform === 'win32' ? 'junction' : 'dir'); madeLink = true; }
  } else {
    if (existing === spec) delete data.dependencies[name];
    if (Array.isArray(data.dsh?.profile?.bundles)) data.dsh.profile.bundles = data.dsh.profile.bundles.filter(id => id !== name);
  }
  const temporary = manifest + '.mimo.tmp';
  await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: permissions });
  await rename(temporary, manifest);
  if (action === 'uninstall' && linkTarget === packageRoot) await unlink(link); // Only the link, never the source directory.
  console.log(`${action} complete; other profile entries preserved. Restart DeepSeek Harness to apply.`);
} catch (error) {
  if (madeLink) await unlink(link).catch(() => {});
  throw error;
} finally { await lockHandle.close(); await unlink(lock); }

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { consoleSession } from './console-session.js';
import { queryBalance, balanceError } from './api.js';

/** Choose an installed Chromium browser on either desktop OS; bundled Chromium is the fallback. */
export async function launchLoginBrowser({ executablePath, platform = process.platform, env = process.env, exists = access, chromium: injected } = {}) {
  const chromium = injected || (await import('playwright')).chromium;
  const candidates = executablePath ? [executablePath] : platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    : platform === 'win32' ? [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean)
      .flatMap(base => [join(base, 'Microsoft/Edge/Application/msedge.exe'), join(base, 'Google/Chrome/Application/chrome.exe')]) : [];
  let selected;
  for (const candidate of candidates) { try { await exists(candidate); selected = candidate; break; } catch { /* Try the next installed browser. */ } }
  const browserEnv = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP',
    'LANG', 'LC_ALL', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'XAUTHORITY']) if (env[key]) browserEnv[key] = env[key];
  try { return await chromium.launch({ headless: false, env: browserEnv, ...(selected ? { executablePath: selected } : {}) }); }
  catch { throw balanceError('browser_unavailable'); }
}

/** User signs in directly at Xiaomi; the DSH renderer receives no password or cookies. */
export async function runBrowserLogin({ auth, launch = launchLoginBrowser, onBrowser = () => {}, signal, query = queryBalance,
  options = {}, now = Date.now, pollMs = 1000 }) {
  let browser;
  const browserAbort = new AbortController();
  const lifecycleSignal = signal ? AbortSignal.any([signal, browserAbort.signal]) : browserAbort.signal;
  try {
    browser = await launch(options); onBrowser(browser);
    if (signal?.aborted) throw balanceError('login_cancelled');
    const context = await browser.newContext(); const page = await context.newPage();
    let closed = false; browser.on('disconnected', () => { closed = true; browserAbort.abort(); });
    await page.goto('https://platform.xiaomimimo.com/console/balance', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const deadline = now() + 600000; let previous, retryAt = 0;
    while (!closed && !signal?.aborted && now() < deadline) {
      const candidate = consoleSession(await context.cookies('https://platform.xiaomimimo.com'), now());
      if (candidate && (candidate.cookie !== previous || now() >= retryAt)) {
        previous = candidate.cookie; retryAt = now() + 300000;
        try {
          await query({ cookie: candidate.cookie, signal: lifecycleSignal });
          if (closed || lifecycleSignal.aborted) throw balanceError('login_cancelled');
          await auth.save(candidate);
          if (closed || lifecycleSignal.aborted) throw balanceError('login_cancelled');
          return;
        } catch (e) {
          if (closed || lifecycleSignal.aborted) throw balanceError('login_cancelled');
          if (e?.code === 'credential_storage_unavailable') throw e;
        }
      }
      await new Promise(resolve => {
        const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, pollMs); signal?.addEventListener('abort', finish, { once: true });
      });
    }
    throw balanceError('login_cancelled');
  } catch (e) {
    if (['credential_storage_unavailable', 'browser_unavailable', 'login_cancelled'].includes(e?.code)) throw e;
    throw balanceError('browser_unavailable');
  } finally { await browser?.close().catch(() => {}); }
}

import { createHash } from 'node:crypto';
const DEFAULTS = {
  'kimi-coding': ['kimi-plan', 'https://api.kimi.com/coding', 'KIMI_API_KEY'],
  zai: ['glm-plan-intl', 'https://api.z.ai/api/coding/paas/v4', 'ZAI_API_KEY'],
  'zai-coding-cn': ['glm-plan', 'https://open.bigmodel.cn/api/coding/paas/v4', 'ZAI_CODING_CN_API_KEY'],
  'xiaomi-token-plan-cn': ['mimo-plan', 'https://token-plan-cn.xiaomimimo.com/v1', null],
  'xiaomi-token-plan-sgp': ['mimo-plan', 'https://token-plan-sgp.xiaomimimo.com/v1', null],
  'xiaomi-token-plan-ams': ['mimo-plan', 'https://token-plan-ams.xiaomimimo.com/v1', null],
  xiaomi: ['mimo', 'https://api.xiaomimimo.com/v1', null],
  deepseek: ['deepseek', 'https://api.deepseek.com', 'DEEPSEEK_API_KEY'],
  'deepseek-official': ['deepseek', 'https://api.deepseek.com', 'DEEPSEEK_API_KEY'],
  moonshotai: ['kimi-intl', 'https://api.moonshot.ai/v1', 'MOONSHOT_API_KEY'],
  'moonshotai-cn': ['kimi-cn', 'https://api.moonshot.cn/v1', 'MOONSHOT_API_KEY'],
};
export const PROVIDER_LABELS = { mimo: '小米 MiMo', deepseek: 'DeepSeek', 'deepseek-account': 'DeepSeek', 'kimi-cn': 'Kimi', 'kimi-intl': 'Kimi', glm: 'GLM', 'glm-plan': 'GLM', 'glm-plan-intl': 'GLM', 'kimi-plan': 'Kimi', 'kimi-plan-intl': 'Kimi', 'mimo-plan': '小米 MiMo' };
export function kindForEndpoint(baseURL) {
  try {
    const url = new URL(baseURL);
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || url.search || url.hash) return null;
    if (['token-plan-cn.xiaomimimo.com', 'token-plan-sgp.xiaomimimo.com', 'token-plan-ams.xiaomimimo.com', 'token-plan.xiaomimimo.com'].includes(url.hostname)) return 'mimo-plan';
    if (url.hostname === 'api.kimi.com' && /^\/coding(?:\/v1)?\/?$/.test(url.pathname)) return 'kimi-plan';
    if (url.hostname === 'api.kimi.ai' && /^\/coding(?:\/v1)?\/?$/.test(url.pathname)) return 'kimi-plan-intl';
    if (/(?:^|\/)coding(?:\/|$)/.test(url.pathname) || /^\/api\/anthropic\/?$/.test(url.pathname)) return ({ 'open.bigmodel.cn': 'glm-plan', 'api.z.ai': 'glm-plan-intl' })[url.hostname] || null;
    return ({ 'api.xiaomimimo.com': 'mimo', 'api.deepseek.com': 'deepseek', 'api.moonshot.cn': 'kimi-cn',
      'api.moonshot.ai': 'kimi-intl', 'open.bigmodel.cn': 'glm' })[url.hostname] || null;
  } catch { return null; }
}
/** Only backend settings are consulted. Public projections omit credential references. */
export function discoverProviders(descriptors = [], { providerIds = ['xiaomi'], accountAvailable = false } = {}) {
  const profiles = new Map(Object.entries(DEFAULTS).map(([id, [, baseURL, apiKeyEnv]]) => [id, { baseURL, defaultCredentialRef: apiKeyEnv }]));
  for (const d of descriptors) {
    if (d?.value?.providers && !Array.isArray(d.value.providers)) {
      for (const [id, profile] of Object.entries(d.value.providers)) profiles.set(id, { ...profiles.get(id), ...profile });
    }
    if (['llm-deepseek-api-key', 'llm-deepseek'].includes(d?.ns) && d.value && !d.value.providers)
      profiles.set('deepseek-official', { ...profiles.get('deepseek-official'), ...d.value });
  }
  const explicit = new Set(providerIds);
  const result = [];
  for (const [id, profile] of profiles) {
    if (['openai', 'openai-codex', 'anthropic', 'deepseek-account'].includes(id)) continue;
    const kind = kindForEndpoint(profile.baseURL);
    if (!kind) continue;
    result.push({ id, kind, label: PROVIDER_LABELS[kind], baseURL: profile.baseURL,
      credentialRef: typeof profile.apiKeyEnv === 'string' ? profile.apiKeyEnv : null,
      defaultCredentialRef: profile.defaultCredentialRef || null });
    explicit.delete(id);
  }
  // Existing explicit MiMo aliases are retained only when no conflicting endpoint is configured.
  for (const id of explicit) if (!profiles.has(id) && !['openai', 'anthropic', 'deepseek', 'deepseek-account'].includes(id))
    result.push({ id, kind: 'mimo', label: PROVIDER_LABELS.mimo, baseURL: DEFAULTS.xiaomi[1], credentialRef: null });
  if (accountAvailable) result.push({ id: 'deepseek-account', kind: 'deepseek-account', label: 'DeepSeek' });
  return result;
}
export const publicProvider = provider => ({ id: provider.id, kind: provider.kind, label: provider.label,
  revision: createHash('sha256').update(JSON.stringify(provider)).digest('hex').slice(0, 16) });

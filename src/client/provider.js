/** Provider IDs are opaque exact keys. Labels and hovered model rows are never consulted. */
const OTHER_PROVIDERS = new Set(['openai', 'openai-codex', 'anthropic', 'deepseek', 'deepseek-account']);
export function isMiMoCurrent(directory, providerIds) {
  const provider = directory?.current?.provider;
  return typeof provider === 'string' && !OTHER_PROVIDERS.has(provider) && providerIds.includes(provider);
}

/** Read redacted provider settings on the backend; send only resulting IDs to the client. */
export function discoverProviderIds(explicitIds, descriptors = []) {
  const ids = new Set(explicitIds.filter(id => typeof id === 'string' && !OTHER_PROVIDERS.has(id)));
  for (const descriptor of descriptors) {
    const providers = descriptor?.value?.providers;
    if (!providers || typeof providers !== 'object' || Array.isArray(providers)) continue;
    for (const [id, profile] of Object.entries(providers)) {
      if (OTHER_PROVIDERS.has(id) || typeof profile?.baseURL !== 'string') continue;
      try {
        const url = new URL(profile.baseURL);
        if (url.protocol === 'https:' && url.hostname === 'api.xiaomimimo.com' && !url.username && !url.password
          && (url.port === '' || url.port === '443')) ids.add(id);
        // A known Token Plan endpoint must not inherit the canonical API balance label.
        if (url.hostname === 'token-plan-cn.xiaomimimo.com' || url.hostname === 'token-plan.xiaomimimo.com') ids.delete(id);
      } catch { /* Invalid model configuration does not identify a MiMo route. */ }
    }
  }
  return [...ids];
}

import React from 'react';
import { ControllerPool } from './pool.js';
import { MenuContribution, UsageContribution } from './contribution.js';
import { installStyles } from './styles.js';
export const inject = ['slots', 'sessions', 'modelDirectories'];

function SessionContribution({ ctx, controller, sessionId, useProjection, usage = false }) {
  const [directory, setDirectory] = React.useState(null);
  React.useEffect(() => {
    let disposed = false, timer, attempt = 0;
    const resolve = () => {
      if (disposed) return;
      try {
        if (ctx.sessions.subagentAddress(sessionId) !== undefined) return;
        const current = ctx.modelDirectories.directoryFor(sessionId);
        setDirectory(current);
        void current.load().catch(() => { /* The official selector owns catalog errors. */ });
      } catch {
        timer = setTimeout(resolve, Math.min(2000, 60 * 2 ** attempt++));
      }
    };
    resolve(); return () => { disposed = true; clearTimeout(timer); };
  }, [ctx, sessionId]);
  return directory ? React.createElement(ProviderContribution, { directory, pool: controller, useProjection, usage }) : null;
}

export function ProviderContribution({ directory, pool, useProjection, usage = false }) {
  React.useSyncExternalStore(pool.subscribe, pool.getSnapshot);
  const subscribe = React.useCallback(f => directory.store.subscribe(f), [directory]);
  const get = React.useCallback(() => directory.store.getSnapshot(), [directory]);
  const selected = React.useSyncExternalStore(subscribe, get);
  const provider = selected?.current?.provider;
  React.useEffect(() => { void pool.bootstrap({ reload: true }); }, [provider, pool]);
  const controller = pool.forProvider(provider);
  return controller ? React.createElement(usage ? UsageContribution : MenuContribution,
    { key: provider + ':' + controller.provider.kind, directory, controller, useProjection }) : null;
}

export function apply(ctx) {
  installStyles(ctx);
  const controller = new ControllerPool();
  ctx.effect(() => () => controller.dispose());
  void controller.bootstrap();
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: 'ai-inline-balance', order: 50,
    label: () => '余额与额度', inject: sessionId => ({ sessionId }),
  }, props => React.createElement(SessionContribution, { ...props, key: props.sessionId, ctx, controller })));
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'ai-conversation-usage', order: 50,
    label: () => '预估用量', inject: sessionId => ({ sessionId }),
  }, props => React.createElement(SessionContribution, { ...props, key: props.sessionId, ctx, controller, usage: true })));
}

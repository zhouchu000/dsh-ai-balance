import React from 'react';
import { BalanceController } from './controller.js';
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
  return directory ? React.createElement(usage ? UsageContribution : MenuContribution, { directory, controller, useProjection }) : null;
}

export function apply(ctx) {
  installStyles(ctx);
  const controller = new BalanceController();
  ctx.effect(() => () => controller.dispose());
  void controller.bootstrap();
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: 'mimo-inline-balance', order: 50,
    label: () => 'MiMo balance', inject: sessionId => ({ sessionId }),
  }, props => React.createElement(SessionContribution, { ...props, key: props.sessionId, ctx, controller })));
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'mimo-conversation-usage', order: 50,
    label: () => 'MiMo usage estimate', inject: sessionId => ({ sessionId }),
  }, props => React.createElement(SessionContribution, { ...props, key: props.sessionId, ctx, controller, usage: true })));
}

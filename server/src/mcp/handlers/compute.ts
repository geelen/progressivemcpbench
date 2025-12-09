import type { HandlerConfig, HandlerContext } from '../types.js';

export function handleCompute(
  handlerConfig: HandlerConfig,
  _args: Record<string, unknown>,
  _ctx: HandlerContext
): unknown {
  const operation = handlerConfig.operation ?? '';

  if (operation === 'fixed_value') {
    return handlerConfig.value;
  }

  throw new Error(`Unknown compute operation: ${operation}`);
}

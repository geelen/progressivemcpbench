import type { HandlerConfig, HandlerContext } from '../types.js';

export function handleStaticJson(
  handlerConfig: HandlerConfig,
  _args: Record<string, unknown>,
  _ctx: HandlerContext
): unknown {
  return handlerConfig.response ?? {};
}

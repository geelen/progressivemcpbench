import type { HandlerConfig, HandlerContext } from '../types.js';
import { handleStaticJson } from './staticJson.js';
import { handleTableLookup } from './tableLookup.js';
import { handleTableSearch } from './tableSearch.js';
import { handleFilesystem } from './filesystem.js';
import { handleCompute } from './compute.js';
import { handleWebCorpus } from './webCorpus.js';
import { handleUrlSearch } from './urlSearch.js';
import { handleHackerNewsStory } from './hackerNews.js';
import { handleWikipediaSearch } from './wikipedia.js';
import { handleExcelReader } from './excelReader.js';

export async function executeHandler(
  handlerConfig: HandlerConfig,
  args: Record<string, unknown>,
  ctx: HandlerContext
): Promise<unknown> {
  const type = handlerConfig.type ?? 'static_json';

  switch (type) {
    case 'static_json':
      return handleStaticJson(handlerConfig, args, ctx);
    case 'table_lookup':
      return handleTableLookup(handlerConfig, args, ctx);
    case 'table_search':
      return handleTableSearch(handlerConfig, args, ctx);
    case 'filesystem':
      return handleFilesystem(handlerConfig, args, ctx);
    case 'compute':
      return handleCompute(handlerConfig, args, ctx);
    case 'web_corpus':
      return handleWebCorpus(handlerConfig, args, ctx);
    case 'url_search':
      return handleUrlSearch(handlerConfig, args, ctx);
    case 'hackernews_story':
      return handleHackerNewsStory(handlerConfig, args, ctx);
    case 'wikipedia_search':
      return handleWikipediaSearch(handlerConfig, args, ctx);
    case 'excel_reader':
      return handleExcelReader(handlerConfig, args, ctx);
    default:
      throw new Error(`Unknown handler type: ${type}`);
  }
}

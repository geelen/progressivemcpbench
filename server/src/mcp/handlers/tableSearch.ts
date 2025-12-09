import type { HandlerConfig, HandlerContext } from '../types.js';
import { getDataset } from '../../data/datasets.js';

export function handleTableSearch(
  handlerConfig: HandlerConfig,
  args: Record<string, unknown>,
  _ctx: HandlerContext
): unknown {
  const datasetPath = handlerConfig.dataset;
  if (!datasetPath) {
    throw new Error('No dataset specified for table_search handler');
  }

  const dataset = getDataset(datasetPath);
  if (!dataset) {
    return { error: `Dataset not found: ${datasetPath}`, results: [] };
  }

  const query = String(args.query ?? '').toLowerCase();
  const maxResults = handlerConfig.max_results ?? 10;
  const searchFields = handlerConfig.search_fields ?? [];
  const includeDecoys = handlerConfig.include_decoys ?? false;
  const decoys = handlerConfig.decoys ?? [];
  const resultFormat = handlerConfig.result_format ?? 'default';

  let items: Record<string, unknown>[] = [];
  if (Array.isArray(dataset)) {
    items = dataset;
  } else if (typeof dataset === 'object' && dataset !== null) {
    const data = dataset as Record<string, unknown>;
    if (Array.isArray(data.entries)) {
      items = data.entries;
    } else if (Array.isArray(data.results)) {
      items = data.results;
    }
  }

  const results: Record<string, unknown>[] = [];

  for (const entry of items) {
    if (query) {
      let searchable: string;
      if (searchFields.length > 0) {
        searchable = searchFields
          .map((f) => String(entry[f] ?? ''))
          .join(' ')
          .toLowerCase();
      } else {
        searchable = JSON.stringify(entry).toLowerCase();
      }
      if (searchable.includes(query)) {
        results.push(entry);
      }
    } else {
      results.push(entry);
    }
  }

  if (includeDecoys && results.length > 0 && Array.isArray(decoys)) {
    const decoysToAdd = decoys.slice(0, Math.max(0, maxResults - results.length));
    results.push(...(decoysToAdd as Record<string, unknown>[]));
  }

  const finalResults = results.slice(0, maxResults);

  if (resultFormat === 'list') {
    return { results: finalResults, total: results.length };
  }

  return finalResults;
}

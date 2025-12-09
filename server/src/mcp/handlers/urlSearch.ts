import type { HandlerConfig, HandlerContext } from '../types.js';
import { getWebSearchIndex, getDecoyUrls } from '../../data/webCorpus.js';

interface SearchEntry {
  id?: string;
  url?: string;
  title?: string;
  short_description?: string;
  tags?: string[];
  example_queries?: string[];
  relevance_penalty?: number;
}

export function handleUrlSearch(
  _handlerConfig: HandlerConfig,
  args: Record<string, unknown>,
  _ctx: HandlerContext
): unknown {
  const query = String(args.query ?? '');
  const maxResults = (args.max_results as number) ?? 5;

  if (!query) {
    return { error: 'Query parameter is required', results: [] };
  }

  const searchIndex = getWebSearchIndex();
  const decoyUrls = getDecoyUrls();

  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/);

  function scoreEntry(entry: SearchEntry, isDecoy: boolean): number {
    const searchableText = [
      entry.title ?? '',
      entry.short_description ?? '',
      ...(entry.tags ?? []),
      ...(entry.example_queries ?? []),
    ]
      .join(' ')
      .toLowerCase();

    let score = 0;
    for (const term of queryTerms) {
      if (searchableText.includes(term)) {
        score += 1;
      }
    }
    if (searchableText.includes(queryLower)) {
      score += 2;
    }

    if (isDecoy && score > 0) {
      const penalty = entry.relevance_penalty ?? 0.3;
      score *= 1 - penalty;
    }

    return score;
  }

  const scoredResults: [number, SearchEntry, boolean][] = [];

  for (const entry of searchIndex) {
    const score = scoreEntry(entry, false);
    if (score > 0) {
      scoredResults.push([score, entry, false]);
    }
  }

  for (const decoy of decoyUrls) {
    const score = scoreEntry(decoy as SearchEntry, true);
    if (score > 0) {
      scoredResults.push([score, decoy as SearchEntry, true]);
    }
  }

  scoredResults.sort((a, b) => b[0] - a[0]);

  const results = scoredResults.slice(0, maxResults).map(([, entry]) => ({
    id: entry.id ?? '',
    url: entry.url ?? '',
    title: entry.title ?? '',
    description: entry.short_description ?? '',
  }));

  if (results.length === 0) {
    return {
      error: 'Search service is temporarily unavailable. Please try again later.',
      query,
    };
  }

  return {
    query,
    results,
    total_found: scoredResults.length,
  };
}

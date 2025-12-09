import type { HandlerConfig, HandlerContext } from '../types.js';
import { getDataset } from '../../data/datasets.js';

interface WikipediaArticle {
  title?: string;
  url?: string;
  summary?: string;
  keywords?: string[];
}

export function handleWikipediaSearch(
  _handlerConfig: HandlerConfig,
  args: Record<string, unknown>,
  _ctx: HandlerContext
): unknown {
  const query = String(args.query ?? '');

  if (!query) {
    return { error: 'Search query is required', results: [] };
  }

  const data = getDataset('data/api/wikipedia_articles.json');
  if (!data) {
    return { error: 'Wikipedia data not available', results: [] };
  }

  const articles = (data as { articles?: WikipediaArticle[] }).articles ?? [];
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/);

  const results: { title: string; url: string; summary: string }[] = [];

  for (const article of articles) {
    const searchable = [
      article.title ?? '',
      article.summary ?? '',
      ...(article.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase();

    if (queryTerms.some((term) => searchable.includes(term))) {
      results.push({
        title: article.title ?? '',
        url: article.url ?? '',
        summary: article.summary ?? '',
      });
    }
  }

  if (results.length === 0) {
    return {
      error: 'Wikipedia search is temporarily unavailable. Please try again later.',
      query,
    };
  }

  return { query, results };
}

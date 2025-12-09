import arxivPapers from './api/arxiv_papers.json';
import audioFiles from './api/audio_files.json';
import commodityPrices from './api/commodity_prices.json';
import forexRates from './api/forex_rates.json';
import hackernewsStories from './api/hackernews_stories.json';
import mavenVersions from './api/maven_versions.json';
import paperMetadata from './api/paper_metadata.json';
import pdfMetadata from './api/pdf_metadata.json';
import trials from './api/trials.json';
import wikipediaArticles from './api/wikipedia_articles.json';

const DATASETS: Record<string, unknown> = {
  'data/api/arxiv_papers.json': arxivPapers,
  'data/api/audio_files.json': audioFiles,
  'data/api/commodity_prices.json': commodityPrices,
  'data/api/forex_rates.json': forexRates,
  'data/api/hackernews_stories.json': hackernewsStories,
  'data/api/maven_versions.json': mavenVersions,
  'data/api/paper_metadata.json': paperMetadata,
  'data/api/pdf_metadata.json': pdfMetadata,
  'data/api/trials.json': trials,
  'data/api/wikipedia_articles.json': wikipediaArticles,
};

export function getDataset(path: string): unknown {
  if (path in DATASETS) {
    return DATASETS[path];
  }

  const basename = path.split('/').pop() ?? '';
  for (const [key, value] of Object.entries(DATASETS)) {
    if (key.endsWith(basename)) {
      return value;
    }
  }

  return null;
}

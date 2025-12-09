import webMetadata from './web/metadata.json';
import webSearchIndex from './web/search_index.json';
import decoyUrls from './web/decoy_urls.json';

import hnStory44490510 from './web/html/news_ycombinator_com_item_id_44490510.html';
import hnStory45973709 from './web/html/news_ycombinator_com_item_id_45973709.html';
import wikiLlullaillaco from './web/html/en_wikipedia_org_wiki_Llullaillaco.html';

interface WebMetadataEntry {
  id?: string;
  title?: string;
  html_path?: string;
}

interface DecoyUrlEntry {
  url: string;
  error_type?: string;
  title?: string;
  short_description?: string;
  tags?: string[];
  relevance_penalty?: number;
}

interface SearchIndexEntry {
  id?: string;
  url?: string;
  title?: string;
  short_description?: string;
  tags?: string[];
  example_queries?: string[];
}

const WEB_METADATA: Record<string, WebMetadataEntry> = webMetadata as Record<
  string,
  WebMetadataEntry
>;
const WEB_SEARCH_INDEX: SearchIndexEntry[] = (
  webSearchIndex as { entries?: SearchIndexEntry[] }
).entries ?? [];
const DECOY_URLS: DecoyUrlEntry[] = (
  decoyUrls as { decoys?: DecoyUrlEntry[] }
).decoys ?? [];

const HTML_CONTENT: Record<string, string> = {
  'https://news.ycombinator.com/item?id=44490510': hnStory44490510,
  'https://news.ycombinator.com/item?id=45973709': hnStory45973709,
  'https://en.wikipedia.org/wiki/Llullaillaco': wikiLlullaillaco,
};

export function getWebMetadata(): Record<string, WebMetadataEntry> {
  return WEB_METADATA;
}

export function getWebSearchIndex(): SearchIndexEntry[] {
  return WEB_SEARCH_INDEX;
}

export function getDecoyUrls(): DecoyUrlEntry[] {
  return DECOY_URLS;
}

export function getWebHtmlContent(url: string): string | null {
  if (HTML_CONTENT[url]) {
    return HTML_CONTENT[url];
  }

  const entry = WEB_METADATA[url];
  if (!entry) {
    return null;
  }

  return null;
}

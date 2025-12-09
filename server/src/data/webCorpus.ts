import webMetadata from './web/metadata.json';
import webSearchIndex from './web/search_index.json';
import decoyUrls from './web/decoy_urls.json';

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

const HTML_CONTENT_CACHE: Record<string, string> = {};

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
  if (HTML_CONTENT_CACHE[url]) {
    return HTML_CONTENT_CACHE[url];
  }

  const entry = WEB_METADATA[url];
  if (!entry || !entry.html_path) {
    return null;
  }

  return `<html><head><title>${entry.title ?? ''}</title></head><body><p>Synthetic HTML content for ${url}</p></body></html>`;
}

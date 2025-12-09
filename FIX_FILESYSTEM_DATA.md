# Fix ProgressiveMCPBench Server Data

## Quick Summary

Accuracy is 0.56 instead of 0.96. The main issues:

1. **Web corpus HTML not being loaded** (42+ failures) - HTML files exist but `webCorpus.ts` returns placeholders
2. **Filesystem text files have placeholders** (12+ failures) - Need real file content

## CRITICAL FIX: webCorpus.ts (Priority 1)

The HTML files are now in `server/src/data/web/html/` but `getWebHtmlContent()` doesn't load them.

### Current broken code (line 54-64):
```typescript
export function getWebHtmlContent(url: string): string | null {
  if (HTML_CONTENT_CACHE[url]) {
    return HTML_CONTENT_CACHE[url];
  }

  const entry = WEB_METADATA[url];
  if (!entry || !entry.html_path) {
    return null;
  }

  // THIS IS THE BUG - returns placeholder instead of loading file
  return `<html><head><title>${entry.title ?? ''}</title></head><body><p>Synthetic HTML content for ${url}</p></body></html>`;
}
```

### Required fix:

For Cloudflare Workers (can't read files at runtime), embed HTML as imports:

```typescript
// Add at top of webCorpus.ts
import html44490510 from './web/html/news_ycombinator_com_item_id_44490510.html';
import html45973709 from './web/html/news_ycombinator_com_item_id_45973709.html';
import htmlLlullaillaco from './web/html/en_wikipedia_org_wiki_Llullaillaco.html';

// Add mapping
const HTML_EMBEDDED: Record<string, string> = {
  'https://news.ycombinator.com/item?id=44490510': html44490510,
  'https://news.ycombinator.com/item?id=45973709': html45973709,
  'https://en.wikipedia.org/wiki/Llullaillaco': htmlLlullaillaco,
};

// Fix getWebHtmlContent
export function getWebHtmlContent(url: string): string | null {
  // Check embedded HTML first
  if (HTML_EMBEDDED[url]) {
    return HTML_EMBEDDED[url];
  }

  if (HTML_CONTENT_CACHE[url]) {
    return HTML_CONTENT_CACHE[url];
  }

  const entry = WEB_METADATA[url];
  if (!entry) {
    return null;
  }

  // Should not reach here if all HTML is embedded
  return null;
}
```

For the HTML imports to work in Cloudflare Workers, you may need to:
1. Configure wrangler.toml or esbuild to handle `.html` as text
2. Or inline the HTML directly as template literals

### Alternative: Inline HTML directly

If imports don't work, embed the content directly:

```typescript
const HTML_EMBEDDED: Record<string, string> = {
  'https://news.ycombinator.com/item?id=45973709': `<!DOCTYPE html>
<html>
<head><title>Hacker News: Story 45973709</title></head>
<body>
<!-- PASTE FULL CONTENT FROM server/src/data/web/html/news_ycombinator_com_item_id_45973709.html -->
</body>
</html>`,
  // ... other URLs
};
```

## FIX 2: filesystem.ts (Priority 2)

Update `server/src/data/filesystem.ts` to have real file content.

### Key test files:

**log_today.txt**:
```
[INFO] Service started.
[WARN] Disk space low.
```

**log_yesterday.txt**:
```
[INFO] Service started.
[WARN] Disk space low.
[ERROR] Database connection failed.
[INFO] User logged in.
```

**Android.txt**: Large file (~279KB) - embed full content from `data/files/root/txt/Android.txt`

**paper_list.bib**: BibTeX file (~5KB) - embed full content from `data/files/root/txt/paper_list.bib`

**CSV files**: Embed full content from `data/files/root/csv/`

### Update FILESYSTEM_DATA:

```typescript
const FILESYSTEM_DATA: Record<string, string> = {
  '/root/txt/log_today.txt': `[INFO] Service started.
[WARN] Disk space low.`,
  
  '/root/txt/log_yesterday.txt': `[INFO] Service started.
[WARN] Disk space low.
[ERROR] Database connection failed.
[INFO] User logged in.`,
  
  '/root/txt/Android.txt': `03-17 16:13:38.811  1702  2395 D WindowManager: printFreezingDisplayLogsopening app wtoken = AppWindowToken{9f4ef63...
... (embed full content from data/files/root/txt/Android.txt)`,
  
  // ... etc
};
```

## Data Files Location

Source files for embedding are in this project:

```
data/files/root/
├── txt/
│   ├── Android.txt (279KB)
│   ├── log_today.txt (46 bytes)
│   ├── log_yesterday.txt (105 bytes)
│   └── paper_list.bib (5KB)
├── csv/
│   ├── customers-100.csv
│   └── products-100.csv
└── ... (other dirs)

server/src/data/web/html/
├── news_ycombinator_com_item_id_44490510.html
├── news_ycombinator_com_item_id_45973709.html
└── en_wikipedia_org_wiki_Llullaillaco.html
```

## Verification

After making changes:

```bash
cd server && pnpm build
# Deploy or test locally

# Then in openbench:
cd /Users/glenmaddern/src/projects/openbench
source .venv/bin/activate
bench eval progressivemcpbench-minimal-servers --limit 20
```

Expected: accuracy should return to ~0.95

## Key Test Cases

These specific test cases should pass after fixes:

1. **HN story 45973709 top reply**: Answer should be `eastdakota` (top reply to top comment by gucci-on-fleek)
2. **Log file diff**: Should identify `[ERROR] Database connection failed.` as only in yesterday's log
3. **Paper authors**: Should extract Driess, Brohan, Wang from paper_list.bib filenames

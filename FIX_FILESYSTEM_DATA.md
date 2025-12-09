# Fix Filesystem Data in MCP Server

## Problem

The ProgressiveMCPBench accuracy dropped from 0.96 to 0.33 because the filesystem MCP server returns placeholder data instead of actual file content.

The file `server/src/data/filesystem.ts` currently has hardcoded stubs like:
```typescript
'/root/txt/log_today.txt': 'Log entries for today...',
```

When the benchmark calls `filesystem__read_file`, it gets `"[Synthetic content for /root/...]"` instead of real content.

## Solution

Update `server/src/data/filesystem.ts` to serve actual file content from the `data/files/` directory that was just copied into this project.

## Data Source

The source of truth is now in this project at:
```
data/files/root/
├── txt/
│   ├── Android.txt          # 279KB Android system log
│   ├── log_today.txt         # 46 bytes
│   ├── log_yesterday.txt     # 105 bytes
│   └── paper_list.bib        # 5KB BibTeX entries
├── csv/
│   ├── customers-100.csv     # 100 customer records
│   └── products-100.csv      # 100 product records
├── excel/
│   ├── goods.xlsx
│   ├── Local_Electronic_Sales.xlsx
│   └── people_data.xlsx
├── pdf/
│   ├── WebArena.pdf
│   └── embodied_ai_papers/
│       ├── PaLM-E, An Embodied Multimodal Language Model, Danny Driess et al., 2023, v1_compressed.pdf
│       ├── RT-2, Vision-Language-Action Models Transfer Web Knowledge to Robotic Control, Anthony Brohan et al., 2023, v1_compressed.pdf
│       └── Voyager, An Open-Ended Embodied Agent with Large Language Models, Guanzhi Wang et al., 2023, v2_compressed.pdf
├── word/
│   ├── CV.docx
│   ├── exchange.docx
│   └── Report_Card.docx
└── music/
    └── mixkit-retro-game-emergency-alarm-1000.wav
```

## Implementation Steps

### 1. For text files (txt, csv, bib)

Read the file content at build time and embed it in `FILESYSTEM_DATA`. For example:

**log_today.txt** content:
```
[INFO] Service started.
[WARN] Disk space low.
```

**log_yesterday.txt** content:
```
[INFO] Service started.
[WARN] Disk space low.
[ERROR] Database connection failed.
[INFO] User logged in.
```

**Android.txt**: Very large file (~279KB). Include full content.

**paper_list.bib**: BibTeX entries (~5KB). Include full content.

**CSV files**: Full content for both customers-100.csv and products-100.csv.

### 2. For binary files (xlsx, docx, pdf, wav)

Since this is a Cloudflare Workers project that can't read files at runtime, choose one of:

a) **For files that need content extraction**: Include extracted text representation
b) **For files where only metadata matters**: Return file metadata like:
   ```typescript
   '/root/excel/goods.xlsx': '[Binary Excel file: goods.xlsx, 3 sheets, 150 rows]'
   ```
c) **For audio**: Return metadata like duration, format, sample rate

### 3. Update DIRECTORY_STRUCTURE

Update to match actual filenames, especially for the PDF subdirectory:

```typescript
const DIRECTORY_STRUCTURE: Record<string, string[]> = {
  '/root': ['txt', 'csv', 'pdf', 'word', 'excel', 'music'],
  '/root/txt': ['Android.txt', 'log_today.txt', 'log_yesterday.txt', 'paper_list.bib'],
  '/root/csv': ['customers-100.csv', 'products-100.csv'],
  '/root/pdf': ['WebArena.pdf', 'embodied_ai_papers'],
  '/root/pdf/embodied_ai_papers': [
    'PaLM-E, An Embodied Multimodal Language Model, Danny Driess et al., 2023, v1_compressed.pdf',
    'RT-2, Vision-Language-Action Models Transfer Web Knowledge to Robotic Control, Anthony Brohan et al., 2023, v1_compressed.pdf',
    'Voyager, An Open-Ended Embodied Agent with Large Language Models, Guanzhi Wang et al., 2023, v2_compressed.pdf'
  ],
  '/root/word': ['CV.docx', 'exchange.docx', 'Report_Card.docx'],
  '/root/excel': ['goods.xlsx', 'Local_Electronic_Sales.xlsx', 'people_data.xlsx'],
  '/root/music': ['mixkit-retro-game-emergency-alarm-1000.wav'],
};
```

### 4. Build-time data loading approach

Create a build script or use bundler config to:
1. Read all files from `data/files/`
2. For text files: embed raw content
3. For binary files: extract text or generate metadata
4. Generate `filesystem.ts` with the embedded data

Or manually create the TypeScript file with all content inline.

## Verification

After updating, the `getFilesystemContent('/root/txt/log_today.txt')` call should return:
```
[INFO] Service started.
[WARN] Disk space low.
```

NOT:
```
[Synthetic content for /root/txt/log_today.txt]
```

## Priority Files

These are the most commonly accessed in benchmarks:
1. `/root/txt/log_today.txt`
2. `/root/txt/log_yesterday.txt`
3. `/root/txt/Android.txt`
4. `/root/txt/paper_list.bib`
5. `/root/csv/customers-100.csv`
6. `/root/csv/products-100.csv`

Start with these text files as they can be directly embedded.

const DIRECTORY_STRUCTURE: Record<string, string[]> = {
  '/root': ['txt', 'csv', 'pdf', 'word', 'excel', 'music'],
  '/root/txt': [
    'Android.txt',
    'log_today.txt',
    'log_yesterday.txt',
    'paper_list.bib',
  ],
  '/root/csv': ['customers-100.csv', 'products-100.csv'],
  '/root/pdf': ['WebArena.pdf', 'embodied_ai_papers'],
  '/root/pdf/embodied_ai_papers': [
    'PaLM-E, An Embodied Multimodal Language Model, Danny Driess et al., 2023, v1_compressed.pdf',
    'RT-2, Vision-Language-Action Models Transfer Web Knowledge to Robotic Control, Anthony Brohan et al., 2023, v1_compressed.pdf',
    'Voyager, An Open-Ended Embodied Agent with Large Language Models, Guanzhi Wang et al., 2023, v2_compressed.pdf',
  ],
  '/root/word': ['CV.docx', 'exchange.docx', 'Report_Card.docx'],
  '/root/excel': [
    'goods.xlsx',
    'Local_Electronic_Sales.xlsx',
    'people_data.xlsx',
  ],
  '/root/music': ['mixkit-retro-game-emergency-alarm-1000.wav'],
};

export interface Env {
  ASSETS: Fetcher;
}

let currentAssets: Fetcher | null = null;

export function setAssets(assets: Fetcher): void {
  currentAssets = assets;
}

function normalizePath(path: string): string {
  if (path.startsWith('/root/')) {
    return path;
  }
  if (path.startsWith('/root')) {
    return path.length > 5 ? '/root/' + path.slice(6) : '/root';
  }
  if (path.startsWith('/')) {
    return '/root' + path;
  }
  return '/root/' + path;
}

function toAssetPath(normalizedPath: string): string {
  return normalizedPath;
}

export async function getFilesystemContent(
  path: string
): Promise<string | null> {
  const normalized = normalizePath(path);
  const assetPath = toAssetPath(normalized);

  if (!currentAssets) {
    return `[Error: Assets not available]`;
  }

  try {
    const response = await currentAssets.fetch(
      new Request(`http://assets${assetPath}`)
    );

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';

    if (
      contentType.includes('text') ||
      assetPath.endsWith('.txt') ||
      assetPath.endsWith('.csv') ||
      assetPath.endsWith('.bib')
    ) {
      return await response.text();
    }

    if (assetPath.endsWith('.pdf')) {
      return `[Binary PDF file: ${assetPath.split('/').pop()}]`;
    }
    if (assetPath.endsWith('.xlsx')) {
      return `[Binary Excel file: ${assetPath.split('/').pop()}]`;
    }
    if (assetPath.endsWith('.docx')) {
      return `[Binary Word document: ${assetPath.split('/').pop()}]`;
    }
    if (assetPath.endsWith('.wav')) {
      return `[Binary audio file: ${assetPath.split('/').pop()}]`;
    }

    return await response.text();
  } catch {
    return null;
  }
}

export function listDirectory(path: string): string[] | null {
  const normalized = normalizePath(path);

  if (normalized in DIRECTORY_STRUCTURE) {
    const entries = DIRECTORY_STRUCTURE[normalized];
    return entries.map((entry) => {
      const fullPath = normalized + '/' + entry;
      const isDir = fullPath in DIRECTORY_STRUCTURE;
      return isDir ? `[DIR] ${entry}` : `[FILE] ${entry}`;
    });
  }

  return null;
}

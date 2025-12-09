const FILESYSTEM_DATA: Record<string, string> = {
  '/root/txt/Android.txt': 'Android operating system documentation...',
  '/root/txt/log_today.txt': 'Log entries for today...',
  '/root/txt/log_yesterday.txt': 'Log entries for yesterday...',
  '/root/txt/paper_list.bib': '@article{example,...}',
};

const DIRECTORY_STRUCTURE: Record<string, string[]> = {
  '/root': ['txt', 'csv', 'pdf', 'word', 'excel', 'music'],
  '/root/txt': ['Android.txt', 'log_today.txt', 'log_yesterday.txt', 'paper_list.bib'],
  '/root/csv': ['customers-100.csv', 'products-100.csv'],
  '/root/pdf': ['WebArena.pdf', 'embodied_ai_papers'],
  '/root/pdf/embodied_ai_papers': ['RT-2.pdf', 'Voyager.pdf', 'PaLM-E.pdf'],
  '/root/word': ['CV.docx', 'exchange.docx', 'Report_Card.docx'],
  '/root/excel': ['goods.xlsx', 'Local_Electronic_Sales.xlsx', 'people_data.xlsx'],
  '/root/music': ['mixkit-retro-game-emergency-alarm-1000.wav'],
};

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

export function getFilesystemContent(path: string): string | null {
  const normalized = normalizePath(path);

  if (normalized in FILESYSTEM_DATA) {
    return FILESYSTEM_DATA[normalized];
  }

  return `[Synthetic content for ${normalized}]`;
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

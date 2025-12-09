import { describe, it, expect } from 'vitest';
import { executeHandler } from './index.js';
import type { HandlerConfig, HandlerContext } from '../types.js';

function makeCtx(serverName: string, toolName: string): HandlerContext {
  return { serverName, toolName };
}

describe('Commodities Markets', () => {
  const commodityHandler: HandlerConfig = {
    type: 'table_lookup',
    dataset: 'data/api/commodity_prices.json',
    key_field: 'commodity',
    nested_path: 'commodities',
  };

  it('should get gold price', async () => {
    const result = await executeHandler(
      commodityHandler,
      { commodity: 'gold' },
      makeCtx('commodities-markets', 'get_commodity_price')
    );

    expect(result).toMatchObject({
      symbol: 'XAU',
      name: 'Gold',
      price_usd: 2650.0,
      unit: 'troy_ounce',
      currency: 'USD',
    });
  });

  it('should get silver price', async () => {
    const result = await executeHandler(
      commodityHandler,
      { commodity: 'silver' },
      makeCtx('commodities-markets', 'get_commodity_price')
    );

    expect(result).toMatchObject({
      symbol: 'XAG',
      name: 'Silver',
      price_usd: 31.5,
      unit: 'troy_ounce',
    });
  });

  it('should get platinum price', async () => {
    const result = await executeHandler(
      commodityHandler,
      { commodity: 'platinum' },
      makeCtx('commodities-markets', 'get_commodity_price')
    );

    expect(result).toMatchObject({
      symbol: 'XPT',
      name: 'Platinum',
      price_usd: 940.0,
    });
  });

  it('should get palladium price', async () => {
    const result = await executeHandler(
      commodityHandler,
      { commodity: 'palladium' },
      makeCtx('commodities-markets', 'get_commodity_price')
    );

    expect(result).toMatchObject({
      symbol: 'XPD',
      name: 'Palladium',
      price_usd: 1020.0,
    });
  });
});

describe('Forex', () => {
  const forexHandler: HandlerConfig = {
    type: 'table_lookup',
    dataset: 'data/api/forex_rates.json',
    key_field: 'to_currency',
    nested_path: 'rates',
  };

  it('should get USD to AUD rate', async () => {
    const result = await executeHandler(
      forexHandler,
      { to_currency: 'AUD' },
      makeCtx('forex', 'get_exchange_rate')
    );

    expect(result).toBe(1.58);
  });

  it('should get USD to EUR rate', async () => {
    const result = await executeHandler(
      forexHandler,
      { to_currency: 'EUR' },
      makeCtx('forex', 'get_exchange_rate')
    );

    expect(result).toBe(0.945);
  });

  it('should get USD to JPY rate', async () => {
    const result = await executeHandler(
      forexHandler,
      { to_currency: 'JPY' },
      makeCtx('forex', 'get_exchange_rate')
    );

    expect(result).toBe(149.5);
  });
});

describe('Maven Dependencies', () => {
  const mavenHandler: HandlerConfig = {
    type: 'table_lookup',
    dataset: 'data/api/maven_versions.json',
    key_field: 'dependency',
  };

  it('should get latest jackson-databind release', async () => {
    const result = await executeHandler(
      mavenHandler,
      { dependency: 'com.fasterxml.jackson.core:jackson-databind' },
      makeCtx('maven-deps-server', 'get_latest_release')
    );

    expect(result).toMatchObject({
      dependency: 'com.fasterxml.jackson.core:jackson-databind',
      latest_version: '2.17.0',
      release_date: '2024-03-15',
    });
  });

  it('should check outdated jackson-databind version', async () => {
    const result = await executeHandler(
      mavenHandler,
      { dependency: 'com.fasterxml.jackson.core:jackson-databind:2.13.4' },
      makeCtx('maven-deps-server', 'get_latest_release')
    );

    expect(result).toMatchObject({
      latest_version: '2.17.0',
      queried_version: '2.13.4',
      is_outdated: true,
    });
  });

  it('should get latest poi-ooxml release', async () => {
    const result = await executeHandler(
      mavenHandler,
      { dependency: 'org.apache.poi:poi-ooxml' },
      makeCtx('maven-deps-server', 'get_latest_release')
    );

    expect(result).toMatchObject({
      dependency: 'org.apache.poi:poi-ooxml',
      latest_version: '5.2.5',
    });
  });
});

describe('Filesystem', () => {
  const filesystemHandler: HandlerConfig = {
    type: 'filesystem',
  };

  it('should list directory contents', async () => {
    const result = await executeHandler(
      filesystemHandler,
      { path: '/root/pdf/embodied_ai_papers' },
      makeCtx('filesystem', 'list_directory')
    );

    expect(result).toContain('[FILE] PaLM-E');
    expect(result).toContain('[FILE] RT-2');
    expect(result).toContain('[FILE] Voyager');
  });

  it('should list root directory', async () => {
    const result = await executeHandler(
      filesystemHandler,
      { path: '/root' },
      makeCtx('filesystem', 'list_directory')
    );

    expect(result).toContain('[DIR] txt');
    expect(result).toContain('[DIR] csv');
    expect(result).toContain('[DIR] pdf');
  });

  it('should list txt directory', async () => {
    const result = await executeHandler(
      filesystemHandler,
      { path: '/root/txt' },
      makeCtx('filesystem', 'list_directory')
    );

    expect(result).toContain('[FILE] Android.txt');
    expect(result).toContain('[FILE] log_today.txt');
  });
});

describe('Word Document Server', () => {
  const wordHandler: HandlerConfig = {
    type: 'filesystem',
    root: '/root/word',
  };

  it('should get document text from exchange.docx', async () => {
    const result = await executeHandler(
      wordHandler,
      { filename: 'exchange.docx' },
      makeCtx('word-document-server', 'get_document_text')
    );

    if (typeof result === 'string') {
      expect(result).toContain('Harry');
      expect(result).toContain('Rebecca');
      expect(result).toContain('Gift Assignments');
    } else {
      expect(result).not.toMatchObject({ error: expect.any(String) });
    }
  });
});

describe('Excel', () => {
  const excelHandler: HandlerConfig = {
    type: 'excel_reader',
  };

  it('should describe sheets in people_data.xlsx', async () => {
    const result = await executeHandler(
      excelHandler,
      { fileAbsolutePath: '/root/excel/people_data.xlsx' },
      makeCtx('excel', 'excel_describe_sheets')
    );

    expect(result).toMatchObject({
      sheets: expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          rows: expect.any(Number),
          columns: expect.any(Number),
        }),
      ]),
    });
  });

  it('should read sheet from people_data.xlsx', async () => {
    const result = await executeHandler(
      excelHandler,
      {
        fileAbsolutePath: '/root/excel/people_data.xlsx',
        sheetName: 'people_data',
      },
      makeCtx('excel', 'excel_read_sheet')
    );

    const data = result as { headers?: string[]; rows?: unknown[][] };
    expect(data.headers).toContain('Name');
    expect(data.headers).toContain('Height (cm)');
    expect(data.rows).toBeDefined();
    expect(data.rows!.length).toBeGreaterThan(0);
  });
});

describe('SearXNG Document Tools', () => {
  const documentHandler: HandlerConfig = {
    type: 'filesystem',
    root: '/root/word',
  };

  it('should read Word document via document_reader', async () => {
    const result = await executeHandler(
      documentHandler,
      { filePath: 'exchange.docx' },
      makeCtx('searxng', 'document_reader')
    );

    if (typeof result === 'string') {
      expect(result).toContain('Harry');
    } else {
      expect(result).not.toMatchObject({ error: expect.any(String) });
    }
  });

  it('should read Excel via excel_read', async () => {
    const excelHandler: HandlerConfig = {
      type: 'excel_reader',
    };

    const result = await executeHandler(
      excelHandler,
      { inputPath: '/root/excel/people_data.xlsx', includeHeaders: true },
      makeCtx('searxng', 'excel_read')
    );

    const data = result as { headers?: string[]; rows?: unknown[][] };
    expect(data.headers).toContain('Name');
    expect(data.rows).toBeDefined();
    expect(data.rows!.length).toBeGreaterThan(0);
  });
});

describe('Web Corpus / Playwright', () => {
  const webCorpusHandler: HandlerConfig = {
    type: 'web_corpus',
    operation: 'get_visible_html',
  };

  it('should get HN story HTML with osigurdson comment', async () => {
    const result = await executeHandler(
      webCorpusHandler,
      { url: 'https://news.ycombinator.com/item?id=44490510' },
      makeCtx('playwright', 'playwright_get_visible_html')
    );

    const data = result as { html?: string; error?: string };
    expect(data.error).toBeUndefined();
    expect(data.html).toContain('osigurdson');
  });

  it('should get HN story HTML with eastdakota comment', async () => {
    const result = await executeHandler(
      webCorpusHandler,
      { url: 'https://news.ycombinator.com/item?id=45973709' },
      makeCtx('playwright', 'playwright_get_visible_html')
    );

    const data = result as { html?: string; error?: string };
    expect(data.error).toBeUndefined();
    expect(data.html).toContain('eastdakota');
    expect(data.html).toContain('gucci-on-fleek');
  });

  it('should get Wikipedia Llullaillaco page', async () => {
    const result = await executeHandler(
      webCorpusHandler,
      { url: 'https://en.wikipedia.org/wiki/Llullaillaco' },
      makeCtx('playwright', 'playwright_get_visible_html')
    );

    const data = result as { html?: string; error?: string };
    expect(data.error).toBeUndefined();
    expect(data.html).toContain('Llullaillaco');
  });
});

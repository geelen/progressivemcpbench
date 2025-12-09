import type { HandlerConfig, HandlerContext } from '../types.js';
import {
  getWebMetadata,
  getWebHtmlContent,
  getDecoyUrls,
} from '../../data/webCorpus.js';

export function handleWebCorpus(
  handlerConfig: HandlerConfig,
  args: Record<string, unknown>,
  _ctx: HandlerContext
): unknown {
  const operation = handlerConfig.operation ?? 'get_visible_html';
  const url = String(args.url ?? '');

  if (!url) {
    return { error: 'URL parameter is required', status: 400 };
  }

  const decoys = getDecoyUrls();
  const decoy = decoys.find((d) => d.url === url);
  if (decoy) {
    return getDecoyError(decoy);
  }

  const metadata = getWebMetadata();

  if (operation === 'navigate') {
    const entry = metadata[url];
    if (entry) {
      return {
        page_id: entry.id ?? 'unknown',
        url,
        title: entry.title ?? '',
        success: true,
      };
    }
    return {
      error: 'URL not found in synthetic web corpus',
      status: 404,
      url,
    };
  }

  if (operation === 'get_visible_html') {
    const entry = metadata[url];
    if (!entry) {
      return {
        error: 'URL not found in synthetic web corpus',
        status: 404,
        url,
      };
    }

    const htmlContent = getWebHtmlContent(url);
    if (!htmlContent) {
      return { error: 'HTML file not found', status: 500, url };
    }

    return {
      url,
      html: htmlContent,
      title: entry.title ?? '',
    };
  }

  if (operation === 'screenshot') {
    const entry = metadata[url];
    if (!entry) {
      return {
        error: 'URL not found in synthetic web corpus',
        status: 404,
        url,
      };
    }
    return {
      url,
      title: entry.title ?? '',
      screenshot: '[Screenshot of page - see HTML content for actual data]',
    };
  }

  return {
    error: `Unknown web_corpus operation: ${operation}`,
    status: 400,
  };
}

interface DecoyUrl {
  url: string;
  error_type?: string;
}

function getDecoyError(decoy: DecoyUrl): Record<string, unknown> {
  const errorType = decoy.error_type ?? 'connection_timeout';

  const errorMessages: Record<
    string,
    { error: string; status: number; error_code: string }
  > = {
    connection_timeout: {
      error: 'Connection timed out while trying to reach the server',
      status: 504,
      error_code: 'ETIMEDOUT',
    },
    connection_reset: {
      error: 'Connection was reset by the remote server',
      status: 502,
      error_code: 'ECONNRESET',
    },
    '503_service_unavailable': {
      error: 'Service temporarily unavailable. Please try again later.',
      status: 503,
      error_code: 'SERVICE_UNAVAILABLE',
    },
    '404_not_found': {
      error: 'The requested page could not be found',
      status: 404,
      error_code: 'NOT_FOUND',
    },
    ssl_error: {
      error: 'SSL certificate verification failed',
      status: 495,
      error_code: 'SSL_ERROR',
    },
  };

  const errorInfo = errorMessages[errorType] ?? errorMessages.connection_timeout;
  return {
    url: decoy.url,
    success: false,
    ...errorInfo,
  };
}

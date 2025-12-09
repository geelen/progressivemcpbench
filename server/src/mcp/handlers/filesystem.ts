import type { HandlerConfig, HandlerContext } from '../types.js';
import { getFilesystemContent, listDirectory } from '../../data/filesystem.js';

export function handleFilesystem(
  _handlerConfig: HandlerConfig,
  args: Record<string, unknown>,
  ctx: HandlerContext
): unknown {
  const toolName = ctx.toolName;

  if (
    toolName === 'read_file' ||
    toolName === 'document_reader' ||
    toolName === 'get_document_text'
  ) {
    const filePath = String(
      args.path ?? args.filePath ?? args.filename ?? ''
    );
    const head = args.head as number | undefined;
    const tail = args.tail as number | undefined;

    const content = getFilesystemContent(filePath);
    if (content === null) {
      return { error: `File not found: ${filePath}` };
    }

    if (typeof content === 'string') {
      const lines = content.split('\n');
      if (head !== undefined) {
        return lines.slice(0, head).join('\n');
      }
      if (tail !== undefined) {
        return lines.slice(-tail).join('\n');
      }
    }

    return content;
  }

  if (toolName === 'read_multiple_files') {
    const paths = (args.paths as string[]) ?? [];
    const results: Record<string, { content: unknown; error: string | null }> =
      {};

    for (const path of paths) {
      const content = getFilesystemContent(path);
      if (content === null) {
        results[path] = { content: null, error: `File not found: ${path}` };
      } else {
        results[path] = { content, error: null };
      }
    }

    return results;
  }

  if (toolName === 'list_directory') {
    const dirPath = String(args.path ?? '');
    const entries = listDirectory(dirPath);

    if (entries === null) {
      return { error: `Directory not found: ${dirPath}` };
    }

    return entries.join('\n');
  }

  if (toolName === 'read_pdf') {
    const sources = (args.sources as { path: string }[]) ?? [];
    return sources.map((source) => ({
      path: source.path,
      metadata: {},
      page_count: 1,
      text: '[PDF content would be extracted here - synthetic stub]',
    }));
  }

  return { error: `Unknown filesystem tool: ${toolName}` };
}

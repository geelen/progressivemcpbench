import type { HandlerConfig, HandlerContext } from '../types.js';

export function handleExcelReader(
  _handlerConfig: HandlerConfig,
  args: Record<string, unknown>,
  ctx: HandlerContext
): unknown {
  const toolName = ctx.toolName;
  const filePath = String(
    args.fileAbsolutePath ?? args.inputPath ?? ''
  );

  if (toolName === 'excel_describe_sheets' || toolName === 'describe_sheets') {
    return {
      sheets: [
        {
          name: 'Sheet1',
          rows: 100,
          columns: 10,
        },
      ],
      message: 'Excel reading is synthetic - actual data not available',
    };
  }

  if (toolName === 'excel_read_sheet' || toolName === 'excel_read') {
    const sheetName = String(args.sheetName ?? 'Sheet1');
    return {
      headers: ['Column A', 'Column B', 'Column C'],
      data: [],
      row_count: 0,
      message: `Excel reading for ${filePath} sheet ${sheetName} is synthetic`,
    };
  }

  return { error: `Unknown Excel tool: ${toolName}` };
}

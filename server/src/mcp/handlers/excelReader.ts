import type { HandlerConfig, HandlerContext } from '../types.js';
import excelData from '../../data/api/excel_data.json';

interface SheetData {
  name: string;
  headers: unknown[];
  rows: unknown[][];
  rowCount: number;
  columnCount: number;
}

interface ExcelFileData {
  sheets: SheetData[];
}

const EXCEL_DATA: Record<string, ExcelFileData> = excelData as Record<
  string,
  ExcelFileData
>;

export function handleExcelReader(
  _handlerConfig: HandlerConfig,
  args: Record<string, unknown>,
  ctx: HandlerContext
): unknown {
  const toolName = ctx.toolName;
  const filePath = String(args.fileAbsolutePath ?? args.inputPath ?? '');

  const fileData = EXCEL_DATA[filePath];

  if (toolName === 'excel_describe_sheets' || toolName === 'describe_sheets') {
    if (!fileData) {
      return {
        error: `Excel file not found: ${filePath}`,
        available_files: Object.keys(EXCEL_DATA),
      };
    }

    return {
      sheets: fileData.sheets.map((sheet) => ({
        name: sheet.name,
        rows: sheet.rowCount,
        columns: sheet.columnCount,
        headers: sheet.headers,
      })),
    };
  }

  if (toolName === 'excel_read_sheet' || toolName === 'excel_read') {
    if (!fileData) {
      return {
        error: `Excel file not found: ${filePath}`,
        available_files: Object.keys(EXCEL_DATA),
      };
    }

    const sheetName = String(args.sheetName ?? fileData.sheets[0]?.name ?? '');
    const sheet = fileData.sheets.find((s) => s.name === sheetName);

    if (!sheet) {
      return {
        error: `Sheet not found: ${sheetName}`,
        available_sheets: fileData.sheets.map((s) => s.name),
      };
    }

    return {
      headers: sheet.headers,
      rows: sheet.rows,
      row_count: sheet.rowCount,
    };
  }

  return { error: `Unknown Excel tool: ${toolName}` };
}

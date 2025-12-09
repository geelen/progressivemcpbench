export type HandlerType =
  | 'static_json'
  | 'table_lookup'
  | 'table_search'
  | 'filesystem'
  | 'excel_reader'
  | 'web_corpus'
  | 'url_search'
  | 'hackernews_story'
  | 'wikipedia_search'
  | 'compute';

export interface HandlerConfig {
  type: HandlerType;
  dataset?: string;
  key_field?: string;
  response?: unknown;
  operation?: string;
  value?: unknown;
  search_fields?: string[];
  include_decoys?: boolean;
  decoys?: unknown[];
  max_results?: number;
  result_format?: string;
  root?: string;
}

export interface InputSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  title?: string;
}

export interface ToolConfig {
  name: string;
  description: string;
  inputSchema: InputSchema;
  handler: HandlerConfig;
}

export interface ServerConfig {
  server_name: string;
  description?: string;
  category?: string;
  tools: ToolConfig[];
}

export type ServersConfig = Record<string, ServerConfig>;

export interface HandlerContext {
  serverName: string;
  toolName: string;
}

import type { HandlerConfig, HandlerContext } from '../types.js';
import { getDataset } from '../../data/datasets.js';

export function handleTableLookup(
  handlerConfig: HandlerConfig,
  args: Record<string, unknown>,
  _ctx: HandlerContext
): unknown {
  const datasetPath = handlerConfig.dataset;
  if (!datasetPath) {
    throw new Error('No dataset specified for table_lookup handler');
  }

  let dataset = getDataset(datasetPath);
  if (!dataset) {
    return { error: `Dataset not found: ${datasetPath}` };
  }

  const nestedPath = handlerConfig.nested_path;
  if (nestedPath && typeof dataset === 'object' && dataset !== null) {
    const nested = (dataset as Record<string, unknown>)[nestedPath];
    if (nested !== undefined) {
      dataset = nested;
    }
  }

  const keyField = handlerConfig.key_field;
  if (!keyField) {
    return dataset;
  }

  const lookupValue = args[keyField];
  if (lookupValue === undefined) {
    return dataset;
  }

  if (Array.isArray(dataset)) {
    const found = dataset.find(
      (item: Record<string, unknown>) => item[keyField] === lookupValue
    );
    return found ?? { error: `Not found: ${keyField}=${lookupValue}` };
  }

  if (typeof dataset === 'object' && dataset !== null) {
    const data = dataset as Record<string, unknown>;
    return data[String(lookupValue)] ?? { error: `Not found: ${lookupValue}` };
  }

  return dataset;
}

// @mingpan/core —— 平台无关：排盘、专业盘、评分、解析、模板兜底、类型、聊天状态机、API 客户端（可插拔传输）
export * from './types';
export * from './sse';
export * from './client';
export * from './text';
export * from './chatState';
export { computeChart, shiShenOf, LUCK, checkDate } from './bazi';
export { buildPro, proText, changSheng, columnOf } from './pro';
export { parseBirth } from './parse';
export { generateFallback } from './fallback';
export { default as CITIES } from './cities';
import * as SC from './score';
export { SC };
export * from './diff';
export { compatRelations, briefBazi } from './compat';
export type { CompatResult } from './compat';

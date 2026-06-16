import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AppliedInstruction, PromptModifiers } from '@/lib/prompting';

export type ApiLogMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ApiRequestLogEntry = {
  id: string;
  timestamp: string;
  status: 'request' | 'success' | 'error' | 'fallback';
  threadId: string;
  provider: string;
  model: string;
  baseURL: string;
  modifiers: PromptModifiers;
  labels: string[];
  appliedInstructions: AppliedInstruction[];
  messages: ApiLogMessage[];
  exactUserMessage: string;
  responseText?: string;
  error?: string;
};

const logDirectory = path.join(process.cwd(), '.data', 'logs');
const logFile = path.join(logDirectory, 'api-requests.jsonl');
const humanLogFile = path.join(logDirectory, 'api-requests.pretty.log');

export function formatApiRequestLogEntry(entry: ApiRequestLogEntry) {
  const messageLines = entry.messages
    .map((message, index) => {
      const content = message.content.trim();
      const paddedContent = indentText(content.length ? content : '(empty)', 4);

      return `${String(index + 1).padStart(2, '0')}. ${message.role}\n${paddedContent}`;
    })
    .join('\n');

  const modifierLines = Object.entries(entry.modifiers)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join('\n');

  const responseText = entry.responseText?.trim();
  const errorText = entry.error?.trim();

  return [
    `[${entry.timestamp}] ${entry.status.toUpperCase()} #${entry.id}`,
    `thread: ${entry.threadId}`,
    `provider: ${entry.provider}`,
    `model: ${entry.model}`,
    `baseURL: ${entry.baseURL}`,
    `labels: ${entry.labels.length ? entry.labels.join(', ') : 'none'}`,
    `modifiers:\n${modifierLines}`,
    `exact user message:\n${indentText(entry.exactUserMessage, 2)}`,
    `messages:\n${messageLines}`,
    entry.responseText ? `response:\n${indentText(responseText ?? 'N/A', 2)}` : null,
    entry.error ? `error:\n${indentText(errorText ?? 'N/A', 2)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function appendApiRequestLog(entry: ApiRequestLogEntry) {
  await mkdir(logDirectory, { recursive: true });
  const humanEntry = formatApiRequestLogEntry(entry);

  await appendFile(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
  await appendFile(humanLogFile, `${humanEntry}\n\n`, 'utf8');
}

export function createApiLogId() {
  return `api_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getApiLogPath() {
  return humanLogFile;
}

function indentText(value: string, spaces: number) {
  const padding = ' '.repeat(spaces);

  return value
    .split('\n')
    .map((line) => `${padding}${line}`)
    .join('\n');
}

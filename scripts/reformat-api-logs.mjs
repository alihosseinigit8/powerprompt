#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const logDirectory = path.join(process.cwd(), '.data', 'logs');
const sourceLog = path.join(logDirectory, 'api-requests.jsonl');
const targetLog = path.join(logDirectory, 'api-requests.pretty.log');

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

try {
  if (!(await fileExists(sourceLog))) {
    console.log(`No source log found at ${sourceLog}`);
    process.exit(0);
  }

  const source = await readFile(sourceLog, 'utf8');
  const lines = source.split('\n').filter((line) => line.trim().length > 0);
  const formatted = lines
    .map((line) => formatApiRequestLogEntry(JSON.parse(line)))
    .filter(Boolean)
    .join('\n\n');

  await mkdir(logDirectory, { recursive: true });
  await writeFile(targetLog, `${formatted}\n`, 'utf8');

  console.log(`Formatted ${lines.length} entries from ${sourceLog} -> ${targetLog}`);
} catch (error) {
  console.error('Failed to reformat logs:', error instanceof Error ? error.message : error);
  process.exit(1);
}

function formatApiRequestLogEntry(entry) {
  const messageLines = entry.messages
    .map((message, index) => {
      const content = (message.content || '').trim();
      const paddedContent = indentText(content.length ? content : '(empty)', 4);

      return `${String(index + 1).padStart(2, '0')}. ${message.role}\n${paddedContent}`;
    })
    .join('\n');

  const modifierLines = Object.entries(entry.modifiers || {})
    .map(([key, value]) => `  ${key}: ${value}`)
    .join('\n');

  const responseText = (entry.responseText || '').trim();
  const errorText = (entry.error || '').trim();

  return [
    `[${entry.timestamp}] ${String(entry.status || '').toUpperCase()} #${entry.id || 'unknown'}`,
    `thread: ${entry.threadId || 'unknown'}`,
    `provider: ${entry.provider || 'unknown'}`,
    `model: ${entry.model || 'unknown'}`,
    `baseURL: ${entry.baseURL || 'unknown'}`,
    `labels: ${Array.isArray(entry.labels) && entry.labels.length ? entry.labels.join(', ') : 'none'}`,
    `modifiers:\n${modifierLines || '  (none)'}`,
    `exact user message:\n${indentText(entry.exactUserMessage || '(empty)', 2)}`,
    `messages:\n${messageLines || '  (none)'}`,
    entry.responseText ? `response:\n${indentText(responseText, 2)}` : null,
    entry.error ? `error:\n${indentText(errorText, 2)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function indentText(value, spaces) {
  const padding = ' '.repeat(spaces);

  return String(value)
    .split('\n')
    .map((line) => `${padding}${line}`)
    .join('\n');
}

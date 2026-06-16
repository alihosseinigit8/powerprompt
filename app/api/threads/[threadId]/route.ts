import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import {
  appendApiRequestLog,
  createApiLogId,
  getApiLogPath,
  type ApiLogMessage,
} from '@/lib/api-logger';
import { buildFallbackReply, buildSystemPrompt, getAppliedInstructions, type PromptModifiers } from '@/lib/prompting';
import { createMessage, publicThread, readData, writeData } from '@/lib/store';

export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const data = await readData();
  const thread = data.threads.find((item) => item.id === threadId);

  if (!thread) {
    return Response.json({ error: 'Thread not found' }, { status: 404 });
  }

  return Response.json({ thread: publicThread(thread) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const payload = (await req.json()) as Partial<{ title: string; folder: string }>;
  const data = await readData();
  const thread = data.threads.find((item) => item.id === threadId);

  if (!thread) {
    return Response.json({ error: 'Thread not found' }, { status: 404 });
  }

  if (typeof payload.title === 'string' && payload.title.trim()) {
    thread.title = payload.title.trim();
  }

  if (typeof payload.folder === 'string' && payload.folder.trim()) {
    thread.folder = payload.folder.trim();
  }

  thread.updatedAt = new Date().toISOString();
  await writeData(data);

  return Response.json({ thread: publicThread(thread) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const data = await readData();
  const nextThreads = data.threads.filter((thread) => thread.id !== threadId);

  if (nextThreads.length === data.threads.length) {
    return Response.json({ error: 'Thread not found' }, { status: 404 });
  }

  data.threads = nextThreads;
  await writeData(data);

  return Response.json({ ok: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const payload = (await req.json()) as Partial<{ message: string; modifiers: PromptModifiers }>;
  const messageText = payload.message?.trim();

  if (!messageText) {
    return Response.json({ error: 'Message is required' }, { status: 400 });
  }

  const data = await readData();
  const thread = data.threads.find((item) => item.id === threadId);

  if (!thread) {
    return Response.json({ error: 'Thread not found' }, { status: 404 });
  }

  const userMessage = createMessage('user', messageText);
  const appliedInstructions = getAppliedInstructions(payload.modifiers);
  const apiLogId = createApiLogId();
  const assistantResult = await buildAssistantReply(
    apiLogId,
    threadId,
    [...thread.messages, userMessage].map((message) => ({ role: message.role, content: message.text })),
    payload.modifiers,
  ).catch((error: unknown) => {
    const safeError = getSafeErrorMessage(error);

    console.error('[PowerPrompt] OpenAI request failed', {
      threadId,
      controls: appliedInstructions.map((instruction) => instruction.label),
      error: safeError,
      logPath: getApiLogPath(),
    });

    return undefined;
  });

  if (!assistantResult) {
    return Response.json(
      {
        error: 'The configured AI provider could not be reached. Check the server terminal for [PowerPrompt] OpenAI request failed.',
        provider: 'openai_error',
        appliedInstructions,
      },
      { status: 502 },
    );
  }

  const assistantMessage = createMessage('assistant', assistantResult.text);

  console.info('[PowerPrompt] AI request completed', {
    threadId,
    provider: assistantResult.provider,
    controls: appliedInstructions.map((instruction) => instruction.label),
    promptLength: messageText.length,
    logPath: getApiLogPath(),
  });

  thread.messages.push(userMessage, assistantMessage);
  thread.title = thread.messages.length === 2 ? titleFromMessage(messageText) : thread.title;
  thread.updatedAt = new Date().toISOString();
  data.user.messagesUsed += 1;

  await writeData(data);

  return Response.json({
    thread: publicThread(thread),
    messages: [userMessage, assistantMessage],
    appliedInstructions,
    provider: assistantResult.provider,
    usage: {
      messagesUsed: data.user.messagesUsed,
      messageLimit: data.user.messageLimit,
    },
  });
}

function titleFromMessage(message: string) {
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length > 44 ? `${compact.slice(0, 44)}...` : compact;
}

async function buildAssistantReply(
  apiLogId: string,
  threadId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  modifiers: PromptModifiers = {},
) {
  const latestMessage = messages.at(-1)?.content ?? '';
  const system = buildSystemPrompt(modifiers);
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o';
  const baseURL = process.env.OPENAI_BASE_URL ?? 'https://api.gapgpt.app/v1';
  const provider = baseURL.includes('gapgpt') ? 'gapgpt' : 'openai';
  const appliedInstructions = getAppliedInstructions(modifiers);
  const apiMessages: ApiLogMessage[] = [{ role: 'system', content: system }, ...messages];

  if (!process.env.OPENAI_API_KEY) {
    const fallbackText = buildFallbackReply(latestMessage, modifiers);

    await appendApiRequestLog({
      id: apiLogId,
      timestamp: new Date().toISOString(),
      status: 'fallback',
      threadId,
      provider: 'fallback',
      model,
      baseURL,
      modifiers,
      labels: appliedInstructions.map((instruction) => instruction.label),
      appliedInstructions,
      messages: apiMessages,
      exactUserMessage: latestMessage,
      responseText: fallbackText,
      error: 'OPENAI_API_KEY is not configured',
    });

    return { provider: 'fallback', text: fallbackText };
  }

  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL,
  });

  await appendApiRequestLog({
    id: apiLogId,
    timestamp: new Date().toISOString(),
    status: 'request',
    threadId,
    provider,
    model,
    baseURL,
    modifiers,
    labels: appliedInstructions.map((instruction) => instruction.label),
    appliedInstructions,
    messages: apiMessages,
    exactUserMessage: latestMessage,
  });

  try {
    const result = await generateText({
      model: openai(model),
      system,
      messages,
    });

    await appendApiRequestLog({
      id: apiLogId,
      timestamp: new Date().toISOString(),
      status: 'success',
      threadId,
      provider,
      model,
      baseURL,
      modifiers,
      labels: appliedInstructions.map((instruction) => instruction.label),
      appliedInstructions,
      messages: apiMessages,
      exactUserMessage: latestMessage,
      responseText: result.text,
    });

    return { provider, text: result.text };
  } catch (error) {
    await appendApiRequestLog({
      id: apiLogId,
      timestamp: new Date().toISOString(),
      status: 'error',
      threadId,
      provider,
      model,
      baseURL,
      modifiers,
      labels: appliedInstructions.map((instruction) => instruction.label),
      appliedInstructions,
      messages: apiMessages,
      exactUserMessage: latestMessage,
      error: getSafeErrorMessage(error),
    });

    throw error;
  }
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown AI provider error';
}

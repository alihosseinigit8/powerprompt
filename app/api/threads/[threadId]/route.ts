import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
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
  const assistantResult = await buildAssistantReply(
    [...thread.messages, userMessage].map((message) => ({ role: message.role, content: message.text })),
    payload.modifiers,
  );
  const assistantMessage = createMessage('assistant', assistantResult.text);
  const appliedInstructions = getAppliedInstructions(payload.modifiers);

  console.info('[PowerPrompt] AI request completed', {
    threadId,
    provider: assistantResult.provider,
    controls: appliedInstructions.map((instruction) => instruction.label),
    promptLength: messageText.length,
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
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  modifiers: PromptModifiers = {},
) {
  const latestMessage = messages.at(-1)?.content ?? '';
  const system = buildSystemPrompt(modifiers);

  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const result = await generateText({
        model: openai('gpt-4o'),
        system,
        messages,
      });

      return { provider: 'openai', text: result.text };
    } catch {
      return { provider: 'fallback', text: buildFallbackReply(latestMessage, modifiers) };
    }
  }

  return { provider: 'fallback', text: buildFallbackReply(latestMessage, modifiers) };
}

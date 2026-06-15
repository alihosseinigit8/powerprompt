import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
};

export type Thread = {
  id: string;
  title: string;
  folder: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  role: string;
  plan: 'Starter' | 'Pro' | 'Team';
  renewalDate: string;
  messageLimit: number;
  messagesUsed: number;
};

export type AppData = {
  user: UserProfile;
  threads: Thread[];
};

const dataDirectory = path.join(process.cwd(), '.data');
const dataFile = path.join(dataDirectory, 'powerprompt.json');

const now = () => new Date().toISOString();

const defaultData: AppData = {
  user: {
    id: 'user_001',
    name: 'Alex Morgan',
    email: 'alex@powerprompt.dev',
    avatarInitials: 'AM',
    role: 'Product Designer',
    plan: 'Pro',
    renewalDate: '2026-07-15',
    messageLimit: 10000,
    messagesUsed: 2384,
  },
  threads: [
    {
      id: 'thread_product_launch',
      title: 'Product launch checklist',
      folder: 'Work',
      model: 'PowerPrompt-5.4',
      createdAt: '2026-06-12T09:00:00.000Z',
      updatedAt: '2026-06-14T17:45:00.000Z',
      messages: [
        {
          id: 'msg_launch_user',
          role: 'user',
          text: 'Help me organize a launch checklist for an AI writing app.',
          createdAt: '2026-06-12T09:00:00.000Z',
        },
        {
          id: 'msg_launch_assistant',
          role: 'assistant',
          text: 'Start with positioning, landing page QA, pricing, onboarding, analytics, support macros, and a rollback plan.',
          createdAt: '2026-06-12T09:00:05.000Z',
        },
      ],
    },
    {
      id: 'thread_research',
      title: 'Research summaries',
      folder: 'Research',
      model: 'PowerPrompt-5.4',
      createdAt: '2026-06-10T12:30:00.000Z',
      updatedAt: '2026-06-13T11:12:00.000Z',
      messages: [
        {
          id: 'msg_research_user',
          role: 'user',
          text: 'Summarize customer feedback into product opportunities.',
          createdAt: '2026-06-10T12:30:00.000Z',
        },
        {
          id: 'msg_research_assistant',
          role: 'assistant',
          text: 'The strongest themes are faster saved prompts, clearer billing controls, and team-shared thread folders.',
          createdAt: '2026-06-10T12:30:04.000Z',
        },
      ],
    },
  ],
};

async function ensureDataFile() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await readFile(dataFile, 'utf8');
  } catch {
    await writeFile(dataFile, JSON.stringify(defaultData, null, 2));
  }
}

export async function readData(): Promise<AppData> {
  await ensureDataFile();
  const file = await readFile(dataFile, 'utf8');
  return JSON.parse(file) as AppData;
}

export async function writeData(data: AppData) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(dataFile, JSON.stringify(data, null, 2));
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createThread(title = 'New conversation'): Thread {
  const timestamp = now();

  return {
    id: createId('thread'),
    title,
    folder: 'Today',
    model: 'PowerPrompt-5.4',
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
  };
}

export function createMessage(role: ChatMessage['role'], text: string): ChatMessage {
  return {
    id: createId('msg'),
    role,
    text,
    createdAt: now(),
  };
}

export function publicThread(thread: Thread) {
  return {
    ...thread,
    messageCount: thread.messages.length,
    preview: thread.messages.at(-1)?.text ?? 'No messages yet',
  };
}

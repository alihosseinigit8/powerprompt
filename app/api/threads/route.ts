import { createThread, publicThread, readData, writeData } from '@/lib/store';

export async function GET() {
  const data = await readData();
  const threads = data.threads
    .slice()
    .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
    .map(publicThread);

  return Response.json({ threads });
}

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => ({}))) as Partial<{ title: string }>;
  const data = await readData();
  const thread = createThread(payload.title?.trim() || 'New conversation');

  data.threads.unshift(thread);
  await writeData(data);

  return Response.json({ thread: publicThread(thread) }, { status: 201 });
}

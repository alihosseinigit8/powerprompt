import { readData, writeData } from '@/lib/store';

const planLimits = {
  Starter: 1000,
  Pro: 10000,
  Team: 50000,
} as const;

export async function GET() {
  const data = await readData();
  return Response.json({ user: data.user });
}

export async function PATCH(req: Request) {
  const payload = (await req.json()) as Partial<{
    name: string;
    email: string;
    role: string;
    plan: 'Starter' | 'Pro' | 'Team';
  }>;
  const data = await readData();
  const plan = payload.plan && payload.plan in planLimits ? payload.plan : data.user.plan;

  data.user = {
    ...data.user,
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : data.user.name,
    email: typeof payload.email === 'string' && payload.email.trim() ? payload.email.trim() : data.user.email,
    role: typeof payload.role === 'string' && payload.role.trim() ? payload.role.trim() : data.user.role,
    plan,
    messageLimit: planLimits[plan],
  };

  data.user.avatarInitials = data.user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  await writeData(data);

  return Response.json({ user: data.user });
}

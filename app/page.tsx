'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type ThemeMode = 'light' | 'dark';
type Plan = 'Starter' | 'Pro' | 'Team';

type UserProfile = {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  role: string;
  plan: Plan;
  renewalDate: string;
  messageLimit: number;
  messagesUsed: number;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
};

type Thread = {
  id: string;
  title: string;
  folder: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  messageCount: number;
  preview: string;
};

type AppliedInstruction = {
  category: 'length' | 'strictness' | 'compute';
  label: string;
  instruction: string;
};

const planLimits: Record<Plan, number> = {
  Starter: 1000,
  Pro: 10000,
  Team: 50000,
};

const quickPrompts = [
  'Draft a pricing page for a productivity AI app.',
  'Summarize this thread into product tasks.',
  'Create a launch checklist with owners and risks.',
];

const modifierLabels = {
  length: [
    ['default', 'Balanced'],
    ['minimal', 'Concise'],
    ['detailed', 'Detailed'],
  ],
  strictness: [
    ['default', 'Helpful'],
    ['fact_check', 'Factual'],
    ['creative', 'Creative'],
  ],
  compute: [
    ['default', 'Normal'],
    ['think_longer', 'Think longer'],
  ],
} as const;

const modifierDescriptions: Record<keyof typeof modifierLabels, Record<string, string>> = {
  length: {
    default: 'Balanced default length.',
    minimal: 'Adds: keep the answer short, direct, and filler-free.',
    detailed: 'Adds: use structure, examples, edge cases, and next steps.',
  },
  strictness: {
    default: 'Balanced helpfulness.',
    fact_check: 'Adds: avoid guessing and flag uncertainty.',
    creative: 'Adds: use original angles and more vivid wording.',
  },
  compute: {
    default: 'Normal effort.',
    think_longer: 'Adds: analyze tradeoffs before answering.',
  },
};

const emptyUser: UserProfile = {
  id: '',
  name: 'Loading...',
  email: '',
  avatarInitials: 'AI',
  role: '',
  plan: 'Starter',
  renewalDate: '',
  messageLimit: 1,
  messagesUsed: 0,
};

export default function ChatApp() {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [user, setUser] = useState<UserProfile>(emptyUser);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [input, setInput] = useState('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [lastAppliedInstructions, setLastAppliedInstructions] = useState<AppliedInstruction[]>([]);
  const [lastProvider, setLastProvider] = useState('');
  const [modifiers, setModifiers] = useState({
    length: 'default',
    strictness: 'default',
    compute: 'default',
  });

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads[0],
    [activeThreadId, threads],
  );
  const usagePercent = Math.min(100, Math.round((user.messagesUsed / user.messageLimit) * 100));
  const groupedThreads = useMemo(() => {
    return threads.reduce<Record<string, Thread[]>>((groups, thread) => {
      groups[thread.folder] = [...(groups[thread.folder] ?? []), thread];
      return groups;
    }, {});
  }, [threads]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('powerprompt-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('powerprompt-theme', theme);
  }, [theme]);

  useEffect(() => {
    void loadApp();
  }, []);

  async function loadApp() {
    setIsLoading(true);
    setError('');

    try {
      const [accountResponse, threadsResponse] = await Promise.all([fetch('/api/account'), fetch('/api/threads')]);
      const accountData = (await accountResponse.json()) as { user: UserProfile };
      const threadsData = (await threadsResponse.json()) as { threads: Thread[] };

      setUser(accountData.user);
      setThreads(threadsData.threads);
      setActiveThreadId(threadsData.threads[0]?.id ?? '');
    } catch {
      setError('Could not load your workspace. Please refresh and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function createNewThread() {
    const response = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New conversation' }),
    });
    const data = (await response.json()) as { thread: Thread };

    setThreads((currentThreads) => [data.thread, ...currentThreads]);
    setActiveThreadId(data.thread.id);
    return data.thread;
  }

  async function deleteThread(threadId: string) {
    await fetch(`/api/threads/${threadId}`, { method: 'DELETE' });

    setThreads((currentThreads) => {
      const nextThreads = currentThreads.filter((thread) => thread.id !== threadId);
      if (activeThreadId === threadId) {
        setActiveThreadId(nextThreads[0]?.id ?? '');
      }
      return nextThreads;
    });
  }

  async function sendPrompt(promptText = input) {
    const trimmedPrompt = promptText.trim();

    if (!trimmedPrompt) {
      return;
    }

    setIsSending(true);
    setError('');
    setInput('');

    try {
      const targetThread = activeThread ?? (await createNewThread());
      const response = await fetch(`/api/threads/${targetThread.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmedPrompt, modifiers }),
      });
      const data = (await response.json()) as {
        thread: Thread;
        messages: ChatMessage[];
        appliedInstructions: AppliedInstruction[];
        provider: 'openai' | 'fallback';
        usage: Pick<UserProfile, 'messageLimit' | 'messagesUsed'>;
      };

      if (!response.ok) {
        throw new Error('Message failed');
      }

      setThreads((currentThreads) => {
        const updatedThread = {
          ...data.thread,
          messages: [...(currentThreads.find((thread) => thread.id === targetThread.id)?.messages ?? []), ...data.messages],
        };
        const hasThread = currentThreads.some((thread) => thread.id === targetThread.id);
        const nextThreads = hasThread
          ? currentThreads.map((thread) => (thread.id === targetThread.id ? updatedThread : thread))
          : [updatedThread, ...currentThreads];

        return nextThreads.sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt));
      });
      setUser((currentUser) => ({ ...currentUser, ...data.usage }));
      setLastAppliedInstructions(data.appliedInstructions);
      setLastProvider(data.provider);
    } catch {
      setError('The message could not be saved. Please try again.');
      setInput(trimmedPrompt);
    } finally {
      setIsSending(false);
    }
  }

  async function saveProfile(updatedUser: UserProfile) {
    const response = await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedUser),
    });
    const data = (await response.json()) as { user: UserProfile };
    setUser(data.user);
  }

  async function changePlan(plan: Plan) {
    const updatedUser = {
      ...user,
      plan,
      messageLimit: planLimits[plan],
    };

    await saveProfile(updatedUser);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendPrompt();
  }

  const surface = theme === 'dark' ? 'bg-[#202123] text-white' : 'bg-slate-100 text-slate-950';
  const sidebar = theme === 'dark' ? 'bg-[#171717] border-white/10' : 'bg-white border-slate-200';
  const panel = theme === 'dark' ? 'bg-[#212121] border-white/10' : 'bg-white border-slate-200';
  const muted = theme === 'dark' ? 'text-zinc-400' : 'text-slate-500';
  const hover = theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-slate-100';

  return (
    <div className={`min-h-screen ${surface}`}>
      <div className="flex min-h-screen">
        <aside className={`hidden w-72 shrink-0 flex-col border-r ${sidebar} lg:flex`}>
          <div className="flex items-center justify-between gap-3 p-4">
            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              className={`flex items-center gap-3 rounded-2xl p-2 text-left transition ${hover}`}
            >
              <Avatar initials={user.avatarInitials} />
              <div>
                <div className="text-sm font-semibold">{user.name}</div>
                <div className={`text-xs ${muted}`}>{user.plan} plan</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${panel}`}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>

          <div className="px-3">
            <button
              type="button"
              onClick={() => void createNewThread()}
              className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-sm transition hover:scale-[1.01]"
            >
              New chat
              <span className="text-lg">+</span>
            </button>
          </div>

          <nav className="mt-5 flex-1 overflow-y-auto px-3 pb-4">
            <SidebarLink icon="⌘" label="Model library" />
            <SidebarLink icon="✦" label="Image generation" />
            <SidebarLink icon="▣" label="Prompt presets" />
            <SidebarLink icon="</>" label="Developer mode" />

            <div className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Projects</div>
            {Object.entries(groupedThreads).map(([folder, folderThreads]) => (
              <div key={folder} className="mt-3">
                <div className={`mb-1 px-2 text-xs font-semibold ${muted}`}>▰ {folder}</div>
                {folderThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setActiveThreadId(thread.id)}
                    className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${hover} ${
                      thread.id === activeThread?.id ? 'bg-violet-500/20 text-violet-200' : ''
                    }`}
                  >
                    <span className="truncate">{thread.title}</span>
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteThread(thread.id);
                      }}
                      className="hidden rounded-lg px-2 text-xs text-zinc-400 group-hover:block"
                    >
                      ×
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className={`m-3 rounded-3xl border p-4 ${panel}`}>
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Usage</span>
              <span>{usagePercent}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-zinc-700">
              <div className="h-2 rounded-full bg-violet-400" style={{ width: `${usagePercent}%` }} />
            </div>
            <p className={`mt-3 text-xs ${muted}`}>
              {user.messagesUsed.toLocaleString()} of {user.messageLimit.toLocaleString()} monthly messages used.
            </p>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className={`flex h-16 items-center justify-between border-b px-4 ${panel}`}>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span>{activeThread?.model ?? 'PowerPrompt-5.4'}</span>
                <span className={muted}>⌄</span>
              </div>
              <div className={`text-xs ${muted}`}>
                {activeThread?.title ?? 'Create a thread to begin'} · Controls are sent as system instructions
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsProfileOpen(true)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${panel}`}
              >
                Manage profile
              </button>
              <button
                type="button"
                onClick={() => void createNewThread()}
                className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white"
              >
                New
              </button>
            </div>
          </header>

          {isLoading ? (
            <div className="grid flex-1 place-items-center text-sm text-zinc-400">Loading your AI workspace...</div>
          ) : (
            <>
              <section className="flex-1 overflow-y-auto px-4 py-6">
                <div className="mx-auto flex max-w-4xl flex-col gap-4">
                  {error && <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}

                  {!activeThread || activeThread.messages.length === 0 ? (
                    <EmptyState onPrompt={(prompt) => void sendPrompt(prompt)} mutedClassName={muted} />
                  ) : (
                    activeThread.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {message.role === 'assistant' && <Avatar initials="AI" compact />}
                        <div
                          className={`max-w-[78%] rounded-3xl px-5 py-4 text-sm leading-7 shadow-sm ${
                            message.role === 'user'
                              ? 'bg-violet-500 text-white'
                              : theme === 'dark'
                                ? 'bg-[#2f2f2f] text-zinc-100'
                                : 'bg-white text-slate-800'
                          }`}
                        >
                          {message.text}
                        </div>
                        {message.role === 'user' && <Avatar initials={user.avatarInitials} compact />}
                      </div>
                    ))
                  )}

                  {isSending && (
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                      <Avatar initials="AI" compact />
                      <span>PowerPrompt is writing and saving the reply...</span>
                    </div>
                  )}
                </div>
              </section>

              <section className={`border-t p-4 ${panel}`}>
                <div className="mx-auto max-w-4xl">
                  <div className={`mb-3 rounded-2xl border px-4 py-3 text-xs leading-6 ${panel}`}>
                    <div className="font-bold">Active prompt controls</div>
                    <div className={muted}>{getActiveControlDescriptions(modifiers).join(' ')}</div>
                    {lastAppliedInstructions.length > 0 && (
                      <div className="mt-2 text-violet-200">
                        Last sent to AI: {lastAppliedInstructions.map((instruction) => instruction.label).join(', ')} · Provider:{' '}
                        {lastProvider === 'openai' ? 'OpenAI API' : 'local fallback'}
                      </div>
                    )}
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {Object.entries(modifierLabels).map(([category, values]) =>
                      values.map(([value, label]) => (
                        <button
                          key={`${category}-${value}`}
                          type="button"
                          onClick={() => setModifiers((current) => ({ ...current, [category]: value }))}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                            modifiers[category as keyof typeof modifiers] === value
                              ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                              : 'border-white/10 text-zinc-400 hover:border-zinc-400'
                          }`}
                        >
                          {label}
                        </button>
                      )),
                    )}
                  </div>
                  <form onSubmit={handleSubmit} className={`flex items-center gap-3 rounded-3xl border px-4 py-3 ${panel}`}>
                    <input
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="Ask PowerPrompt anything..."
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500"
                    />
                    <button
                      type="submit"
                      disabled={isSending || !input.trim()}
                      className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      {isProfileOpen && (
        <ProfileModal
          user={user}
          onClose={() => setIsProfileOpen(false)}
          onSave={(updatedUser) => void saveProfile(updatedUser)}
          onPlanChange={(plan) => void changePlan(plan)}
          panelClassName={panel}
          mutedClassName={muted}
        />
      )}
    </div>
  );
}

function SidebarLink({ icon, label }: { icon: string; label: string }) {
  return (
    <button type="button" className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/10">
      <span className="w-6 text-center text-zinc-400">{icon}</span>
      {label}
    </button>
  );
}

function getActiveControlDescriptions(modifiers: Record<keyof typeof modifierLabels, string>) {
  return Object.entries(modifiers).map(([category, value]) => {
    const descriptionGroup = modifierDescriptions[category as keyof typeof modifierDescriptions];
    return descriptionGroup[value] ?? '';
  });
}

function Avatar({ initials, compact = false }: { initials: string; compact?: boolean }) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-300 to-amber-200 font-black text-slate-950 ${
        compact ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'
      }`}
    >
      {initials || 'AI'}
    </div>
  );
}

function EmptyState({ onPrompt, mutedClassName }: { onPrompt: (prompt: string) => void; mutedClassName: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-violet-500 text-2xl shadow-lg shadow-violet-500/20">
          ✦
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">How can I help you today?</h1>
        <p className={`mx-auto mt-3 max-w-xl text-sm leading-6 ${mutedClassName}`}>
          Profile management, subscription state, thread history, saved messages, and plan usage are all backed by API routes.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPrompt(prompt)}
              className="rounded-3xl border border-white/10 bg-white/5 p-4 text-left text-sm leading-6 transition hover:bg-white/10"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileModal({
  user,
  onClose,
  onSave,
  onPlanChange,
  panelClassName,
  mutedClassName,
}: {
  user: UserProfile;
  onClose: () => void;
  onSave: (user: UserProfile) => void;
  onPlanChange: (plan: Plan) => void;
  panelClassName: string;
  mutedClassName: string;
}) {
  const [draftUser, setDraftUser] = useState(user);

  function updateDraft(field: keyof UserProfile, value: string) {
    setDraftUser((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className={`w-full max-w-2xl rounded-[2rem] border p-6 shadow-2xl ${panelClassName}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar initials={user.avatarInitials} />
            <div>
              <h2 className="text-xl font-bold">Account and subscription</h2>
              <p className={`text-sm ${mutedClassName}`}>Manage user details, billing plan, and usage.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xl text-zinc-400 hover:bg-white/10">
            ×
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Name
            <input
              value={draftUser.name}
              onChange={(event) => updateDraft('name', event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="text-sm font-semibold">
            Email
            <input
              value={draftUser.email}
              onChange={(event) => updateDraft('email', event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Role
            <input
              value={draftUser.role}
              onChange={(event) => updateDraft('role', event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
            />
          </label>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {(['Starter', 'Pro', 'Team'] as Plan[]).map((plan) => (
            <button
              key={plan}
              type="button"
              onClick={() => {
                setDraftUser((current) => ({ ...current, plan, messageLimit: planLimits[plan] }));
                onPlanChange(plan);
              }}
              className={`rounded-3xl border p-4 text-left transition ${
                user.plan === plan ? 'border-violet-400 bg-violet-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <div className="font-bold">{plan}</div>
              <div className={`mt-1 text-xs ${mutedClassName}`}>{planLimits[plan].toLocaleString()} messages / month</div>
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Renewal date</span>
            <span>{user.renewalDate || 'Not set'}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm font-semibold">
            <span>Current usage</span>
            <span>
              {user.messagesUsed.toLocaleString()} / {user.messageLimit.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draftUser);
              onClose();
            }}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950"
          >
            Save profile
          </button>
        </div>
      </div>
    </div>
  );
}

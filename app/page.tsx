'use client';

import { useChat } from '@ai-sdk/react';
import { FormEvent, useState } from 'react';

export default function ChatApp() {
  const [modifiers, setModifiers] = useState({
    length: 'default',
    strictness: 'default',
    compute: 'default',
  });

  const { messages, sendMessage, status } = useChat({
    body: { modifiers },
  });
  const [input, setInput] = useState('');

  const handleModifierChange = (category: string, value: string) => {
    setModifiers((prev) => ({ ...prev, [category]: value }));
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return;
    }

    await sendMessage({ text: trimmedInput });
    setInput('');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="w-80 border-r bg-white p-6 flex flex-col gap-6">
        <h2 className="text-xl font-bold text-gray-800">AI Personality</h2>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-600">Response Length</label>
          <select
            className="rounded-md border bg-gray-50 p-2"
            value={modifiers.length}
            onChange={(e) => handleModifierChange('length', e.target.value)}
          >
            <option value="default">Default</option>
            <option value="minimal">Minimal / Short</option>
            <option value="detailed">Very Detailed</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-600">Strictness</label>
          <select
            className="rounded-md border bg-gray-50 p-2"
            value={modifiers.strictness}
            onChange={(e) => handleModifierChange('strictness', e.target.value)}
          >
            <option value="default">Default</option>
            <option value="fact_check">Fact Check / No Hallucinations</option>
            <option value="creative">Extremely Creative</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-600">Compute / Reasoning</label>
          <select
            className="rounded-md border bg-gray-50 p-2"
            value={modifiers.compute}
            onChange={(e) => handleModifierChange('compute', e.target.value)}
          >
            <option value="default">Default</option>
            <option value="think_longer">Think Longer (Step-by-Step)</option>
          </select>
        </div>
      </div>

      <div className="relative flex h-full flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 pb-32">
          {messages.length === 0 && (
            <div className="mt-20 text-center text-gray-400">Start a conversation...</div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-2xl rounded-xl p-4 ${
                m.role === 'user'
                  ? 'self-end bg-blue-600 text-white'
                  : 'self-start border bg-white text-gray-800'
              }`}
            >
              <div className="mb-1 text-xs font-bold opacity-75">
                {m.role === 'user' ? 'You' : 'AI'}
              </div>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
          {status !== 'ready' && <div className="text-sm italic text-gray-400">AI is typing...</div>}
        </div>

        <div className="absolute bottom-0 w-full border-t bg-gray-50 p-6">
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-4xl gap-4">
            <input
              type="text"
              className="flex-1 rounded-lg border p-4 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={input}
              placeholder="Type your prompt here..."
              onChange={handleInputChange}
            />
            <button
              type="submit"
              disabled={status !== 'ready'}
              className="rounded-lg bg-blue-600 px-8 py-4 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

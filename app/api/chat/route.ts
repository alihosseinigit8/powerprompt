import { convertToModelMessages, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const customOpenAI = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // baseURL: 'https://api.gapgpt.app/v1',
});

export async function POST(req: Request) {
  const { messages, modifiers } = await req.json();

  let systemPrompt = 'You are a helpful AI assistant. ';

  if (modifiers?.length === 'minimal') {
    systemPrompt +=
      'Provide a highly concise, direct answer. Do not include filler words. Get straight to the point. ';
  } else if (modifiers?.length === 'detailed') {
    systemPrompt +=
      'Provide a comprehensive, exhaustive response. Break down complex concepts and use headings/bullet points. ';
  }

  if (modifiers?.strictness === 'fact_check') {
    systemPrompt +=
      "Prioritize absolute factual accuracy above all else. If you are unsure, say 'I do not know' instead of guessing. ";
  } else if (modifiers?.strictness === 'creative') {
    systemPrompt +=
      'Adopt a highly creative, engaging, and imaginative tone. Think outside the box. ';
  }

  if (modifiers?.compute === 'think_longer') {
    systemPrompt += 'Before providing your final answer, think step-by-step and show your work. ';
  }

  const result = await streamText({
    model: customOpenAI('gpt-4o'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}

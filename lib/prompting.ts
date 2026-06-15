export type PromptModifiers = {
  length?: string;
  strictness?: string;
  compute?: string;
};

export type AppliedInstruction = {
  category: 'length' | 'strictness' | 'compute';
  label: string;
  instruction: string;
};

const baseInstruction =
  'You are PowerPrompt, a helpful AI assistant. Obey the user request while applying the response controls below.';

const lengthInstructions: Record<string, AppliedInstruction> = {
  minimal: {
    category: 'length',
    label: 'Concise',
    instruction: 'Keep the answer short, direct, and free of filler. Prefer 1-4 sentences unless the user asks for more.',
  },
  detailed: {
    category: 'length',
    label: 'Detailed',
    instruction:
      'Give a thorough, structured answer with useful headings, bullets, examples, edge cases, and concrete next steps when relevant.',
  },
};

const strictnessInstructions: Record<string, AppliedInstruction> = {
  fact_check: {
    category: 'strictness',
    label: 'Factual',
    instruction:
      'Prioritize factual accuracy. Do not guess. Clearly say when information is uncertain, missing, or needs verification.',
  },
  creative: {
    category: 'strictness',
    label: 'Creative',
    instruction:
      'Use a more imaginative, engaging style. Offer original angles and vivid phrasing while still satisfying the request.',
  },
};

const computeInstructions: Record<string, AppliedInstruction> = {
  think_longer: {
    category: 'compute',
    label: 'Think longer',
    instruction:
      'Spend extra effort analyzing tradeoffs before answering. Provide the concise final reasoning or decision criteria without exposing hidden chain-of-thought.',
  },
};

export function getAppliedInstructions(modifiers: PromptModifiers = {}) {
  return [
    modifiers.length ? lengthInstructions[modifiers.length] : undefined,
    modifiers.strictness ? strictnessInstructions[modifiers.strictness] : undefined,
    modifiers.compute ? computeInstructions[modifiers.compute] : undefined,
  ].filter((instruction): instruction is AppliedInstruction => Boolean(instruction));
}

export function buildSystemPrompt(modifiers: PromptModifiers = {}) {
  const appliedInstructions = getAppliedInstructions(modifiers);

  if (appliedInstructions.length === 0) {
    return `${baseInstruction}\n\nResponse controls: Balanced default answer.`;
  }

  return [
    baseInstruction,
    '',
    'Response controls:',
    ...appliedInstructions.map((item) => `- ${item.label}: ${item.instruction}`),
  ].join('\n');
}

export function buildFallbackReply(message: string, modifiers: PromptModifiers = {}) {
  const appliedInstructions = getAppliedInstructions(modifiers);
  const controlSummary =
    appliedInstructions.length > 0
      ? appliedInstructions.map((instruction) => instruction.label).join(', ')
      : 'Balanced';

  return [
    `I could not reach the configured AI provider, so this local fallback saved your message instead.`,
    `Applied controls: ${controlSummary}.`,
    `User prompt: “${message}”`,
  ].join('\n');
}

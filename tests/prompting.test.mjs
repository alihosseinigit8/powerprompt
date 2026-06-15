import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function importPromptingModule() {
  const source = await readFile(new URL('../lib/prompting.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const encoded = Buffer.from(compiled.outputText).toString('base64');

  return import(`data:text/javascript;base64,${encoded}`);
}

test('default prompt uses balanced controls', async () => {
  const { buildSystemPrompt } = await importPromptingModule();
  const prompt = buildSystemPrompt();

  assert.match(prompt, /Balanced default answer/);
  assert.doesNotMatch(prompt, /Detailed:/);
  assert.doesNotMatch(prompt, /Factual:/);
});

test('detailed mode adds concrete detail instructions', async () => {
  const { buildSystemPrompt, getAppliedInstructions } = await importPromptingModule();
  const prompt = buildSystemPrompt({ length: 'detailed' });

  assert.match(prompt, /Detailed:/);
  assert.match(prompt, /headings, bullets, examples, edge cases/);
  assert.deepEqual(
    getAppliedInstructions({ length: 'detailed' }).map((instruction) => instruction.label),
    ['Detailed'],
  );
});

test('minimal mode and detailed mode are mutually exclusive', async () => {
  const { buildSystemPrompt } = await importPromptingModule();
  const prompt = buildSystemPrompt({ length: 'minimal' });

  assert.match(prompt, /Concise:/);
  assert.match(prompt, /short, direct/);
  assert.doesNotMatch(prompt, /Detailed:/);
});

test('strictness controls add factual or creative instructions', async () => {
  const { buildSystemPrompt } = await importPromptingModule();

  assert.match(buildSystemPrompt({ strictness: 'fact_check' }), /Do not guess/);
  assert.match(buildSystemPrompt({ strictness: 'creative' }), /imaginative, engaging/);
});

test('combined controls are all present in the model system prompt', async () => {
  const { buildSystemPrompt, getAppliedInstructions } = await importPromptingModule();
  const modifiers = {
    length: 'detailed',
    strictness: 'fact_check',
    compute: 'think_longer',
  };
  const prompt = buildSystemPrompt(modifiers);

  assert.match(prompt, /Detailed:/);
  assert.match(prompt, /Factual:/);
  assert.match(prompt, /Think longer:/);
  assert.deepEqual(
    getAppliedInstructions(modifiers).map((instruction) => instruction.label),
    ['Detailed', 'Factual', 'Think longer'],
  );
});

test('fallback reply reports applied controls when provider fails', async () => {
  const { buildFallbackReply } = await importPromptingModule();
  const reply = buildFallbackReply('hello', { length: 'minimal', strictness: 'creative' });

  assert.match(reply, /local fallback/);
  assert.match(reply, /Applied controls: Concise, Creative/);
  assert.match(reply, /hello/);
});

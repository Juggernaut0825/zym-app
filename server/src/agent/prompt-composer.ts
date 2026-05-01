interface ComposeCoachPromptInput {
  soulPrompt: string;
  skillPrompt: string;
  guardrailPrompt: string;
  languagePrompt?: string;
  measurementPrompt?: string;
  knowledgePrompt?: string;
  strictFallbackPrompt?: string;
  injectionPrompt?: string;
  sessionPrompt?: string;
}

export function composeCoachSystemPrompt(input: ComposeCoachPromptInput): string {
  return [
    input.soulPrompt,
    input.guardrailPrompt,
    input.languagePrompt || '',
    input.measurementPrompt || '',
    input.skillPrompt,
    input.knowledgePrompt || '',
    input.strictFallbackPrompt || '',
    input.injectionPrompt || '',
    input.sessionPrompt || '',
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

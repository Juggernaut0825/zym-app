interface ComposeCoachPromptInput {
  soulPrompt: string;
  skillPrompt: string;
  guardrailPrompt: string;
  knowledgePrompt?: string;
  strictFallbackPrompt?: string;
  injectionPrompt?: string;
  sessionPrompt?: string;
}

export function composeCoachSystemPrompt(input: ComposeCoachPromptInput): string {
  return [
    input.soulPrompt,
    input.guardrailPrompt,
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

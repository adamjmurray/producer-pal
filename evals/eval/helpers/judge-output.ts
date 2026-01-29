/**
 * Streaming output utilities for LLM judge
 */

/**
 * Print judge info (model, criteria)
 *
 * @param provider - LLM provider name
 * @param model - Model being used
 * @param criteria - Evaluation criteria
 */
export function printJudgeHeader(
  provider: string,
  model: string,
  criteria: string,
): void {
  console.log(`\n[LLM Judge] ${provider}/${model}`);
  console.log(`[LLM Judge] Criteria: ${criteria}`);
  process.stdout.write(`[LLM Judge] Response: `);
}

/**
 * Print streaming text chunk to stdout
 *
 * @param text - Text chunk to print
 */
export function printJudgeChunk(text: string): void {
  process.stdout.write(text);
}

/**
 * Finish judge output with newline
 */
export function finishJudgeOutput(): void {
  console.log("\n");
}

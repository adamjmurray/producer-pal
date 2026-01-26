/**
 * Shared streaming utilities for Responses API implementations
 */
import { startThought, continueThought, endThought } from "./formatting.ts";

/**
 * Common stream state fields for tracking reasoning output
 */
export interface ThoughtStreamState {
  inThought: boolean;
  currentContent: string;
  currentReasoning?: string;
}

/**
 * Handles a reasoning text delta by writing to stdout with thought formatting
 *
 * @param state - Stream state to update
 * @param text - Reasoning text to display
 */
export function handleReasoningText(
  state: ThoughtStreamState,
  text: string,
): void {
  if (!text) return;

  if (state.currentReasoning !== undefined) {
    state.currentReasoning += text;
  }

  process.stdout.write(
    state.inThought ? continueThought(text) : startThought(text),
  );
  state.inThought = true;
}

/**
 * Handles the end of a reasoning section
 *
 * @param state - Stream state to update
 */
export function finishReasoning(state: ThoughtStreamState): void {
  if (state.inThought) {
    process.stdout.write(endThought());
    state.inThought = false;
  }
}

/**
 * Handles a content text delta by writing to stdout
 *
 * @param state - Stream state to update
 * @param text - Content text to display
 */
export function handleContentText(
  state: ThoughtStreamState,
  text: string,
): void {
  finishReasoning(state);
  state.currentContent += text;
  process.stdout.write(text);
}

/**
 * Gets text from a delta that may be a string or object with text property
 *
 * @param delta - Delta value from stream event
 * @returns Text content or undefined
 */
export function getDeltaText(
  delta: string | { text?: string } | undefined,
): string | undefined {
  if (typeof delta === "string") return delta;

  return delta?.text;
}

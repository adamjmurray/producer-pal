/**
 * Thought text processing utilities for streaming responses
 */

import { startThought, continueThought, endThought } from "./formatting.ts";

/**
 * Result of processing thought text
 */
export interface ThoughtProcessResult {
  /** Whether currently in thought mode after processing */
  inThought: boolean;
  /** The actual response text (undefined if this was thought content) */
  text?: string;
  /** Formatted output string to write to stdout */
  output: string;
}

/**
 * Process text with thought tracking, returning formatted output
 *
 * @param text - The text content
 * @param isThought - Whether this is thought content
 * @param wasInThought - Whether previously in thought mode
 * @returns Processing result with output string and state
 */
export function processThoughtText(
  text: string,
  isThought: boolean,
  wasInThought: boolean,
): ThoughtProcessResult {
  if (isThought) {
    return {
      inThought: true,
      output: wasInThought ? continueThought(text) : startThought(text),
    };
  }

  const prefix = wasInThought ? endThought() : "";

  return {
    inThought: false,
    text,
    output: prefix + text,
  };
}

import { createInterface, type Interface } from "node:readline";
import type { MessageSource, TurnResult } from "./types.ts";

/**
 * Create a readline interface for user input
 *
 * @returns Readline interface
 */
export function createReadline(): Interface {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input
 *
 * @param rl - Readline interface
 * @param prompt - Prompt text to display
 * @returns User input
 */
export function question(rl: Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

/**
 * Check if input is an exit command
 *
 * @param input - User input to check
 * @returns True if input is an exit command
 */
export function isExitCommand(input: string): boolean {
  const trimmed = input.trim().toLowerCase();

  return trimmed === "exit" || trimmed === "quit" || trimmed === "bye";
}

export interface ChatLoopCallbacks<TSession> {
  sendMessage: (
    session: TSession,
    input: string,
    turnCount: number,
  ) => Promise<TurnResult>;
}

export interface ChatLoopConfig {
  once?: boolean;
}

/**
 * Run a chat loop with messages from a MessageSource
 *
 * @param session - Chat session context
 * @param messageSource - Source of messages (interactive, array, or file)
 * @param config - Loop configuration
 * @param callbacks - Callback functions for the loop
 */
export async function runChatLoop<TSession>(
  session: TSession,
  messageSource: MessageSource,
  config: ChatLoopConfig,
  callbacks: ChatLoopCallbacks<TSession>,
): Promise<void> {
  let turnCount = 0;

  while (true) {
    const input = await messageSource.nextMessage();

    if (input == null) {
      break;
    }

    turnCount++;
    console.log(`\n[Turn ${turnCount}] User: ${input}`);

    await callbacks.sendMessage(session, input, turnCount);

    if (config.once) break;
  }
}

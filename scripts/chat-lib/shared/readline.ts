import { createInterface, type Interface } from "node:readline";

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
  ) => Promise<void>;
}

export interface ChatLoopConfig {
  initialText: string;
  singleResponse?: boolean;
}

/**
 * Run an interactive chat loop
 *
 * @param session - Chat session context
 * @param rl - Readline interface
 * @param config - Loop configuration
 * @param callbacks - Callback functions for the loop
 */
export async function runChatLoop<TSession>(
  session: TSession,
  rl: Interface,
  config: ChatLoopConfig,
  callbacks: ChatLoopCallbacks<TSession>,
): Promise<void> {
  let turnCount = 0;
  let currentInput = config.initialText;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    if (currentInput.trim() === "") {
      currentInput = await question(rl, "> ");
    }

    if (isExitCommand(currentInput)) {
      console.log("Goodbye!");
      break;
    }

    turnCount++;
    console.log(`\n[Turn ${turnCount}] User: ${currentInput}`);

    await callbacks.sendMessage(session, currentInput, turnCount);

    if (config.singleResponse) break;

    currentInput = await question(rl, "\n> ");
  }
}

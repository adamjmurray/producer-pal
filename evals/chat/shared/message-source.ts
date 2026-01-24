import { readFile } from "node:fs/promises";
import type { Interface } from "node:readline";
import { isExitCommand, question } from "./readline.ts";
import type { ChatOptions, MessageSource } from "./types.ts";

/**
 * Interactive message source that reads from readline
 */
export class InteractiveMessageSource implements MessageSource {
  private rl: Interface;
  private initialText: string;
  private isFirst = true;

  /**
   * @param rl - Readline interface for user input
   * @param initialText - Optional initial text for first message
   */
  constructor(rl: Interface, initialText: string = "") {
    this.rl = rl;
    this.initialText = initialText;
  }

  /**
   * Get next message from user input
   *
   * @returns Next message or null if user exits
   */
  async nextMessage(): Promise<string | null> {
    let input: string;

    if (this.isFirst && this.initialText.trim() !== "") {
      input = this.initialText;
      this.isFirst = false;
    } else {
      const prompt = this.isFirst ? "> " : "\n> ";

      this.isFirst = false;

      // Loop until non-empty input (matches original behavior)
      do {
        input = await question(this.rl, prompt);
      } while (input.trim() === "");
    }

    if (isExitCommand(input)) {
      console.log("Goodbye!");

      return null;
    }

    return input;
  }
}

/**
 * Message source that iterates through an array of messages
 */
export class ArrayMessageSource implements MessageSource {
  private messages: string[];
  private index = 0;

  /**
   * @param messages - Array of messages to iterate through
   */
  constructor(messages: string[]) {
    this.messages = messages;
  }

  /**
   * Get next message from array
   *
   * @returns Next message or null when exhausted
   */
  async nextMessage(): Promise<string | null> {
    if (this.index >= this.messages.length) {
      return null;
    }

    return this.messages[this.index++] ?? null;
  }
}

/**
 * Message source that reads messages from a file (one per line)
 */
export class FileMessageSource implements MessageSource {
  private messages: string[] | null = null;
  private index = 0;
  private filePath: string;

  /**
   * @param filePath - Path to file containing messages (one per line)
   */
  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Get next message from file
   *
   * @returns Next message or null when exhausted
   */
  async nextMessage(): Promise<string | null> {
    if (this.messages == null) {
      const content = await readFile(this.filePath, "utf-8");

      this.messages = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
    }

    if (this.index >= this.messages.length) {
      return null;
    }

    return this.messages[this.index++] ?? null;
  }
}

/**
 * Create appropriate message source based on chat options
 *
 * @param rl - Readline interface for interactive mode
 * @param options - Chat options with messages/file settings
 * @param initialText - Initial text for interactive mode
 * @returns Configured message source
 */
export function createMessageSource(
  rl: Interface,
  options: ChatOptions,
  initialText: string,
): MessageSource {
  if (options.messages && options.messages.length > 0) {
    return new ArrayMessageSource(options.messages);
  }

  if (options.file) {
    return new FileMessageSource(options.file);
  }

  return new InteractiveMessageSource(rl, initialText);
}

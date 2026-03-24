// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile } from "node:fs/promises";
import { type Interface } from "node:readline";
import {
  GRAY_PROMPT,
  formatTurnHeader,
  formatUserLabel,
} from "./formatting.ts";
import { isExitCommand, question } from "./readline.ts";
import { type ChatOptions, type MessageSource } from "./types.ts";

/**
 * Print turn header with turn number and user label
 * @param turnCount - Current turn number
 */
function printTurnHeader(turnCount: number): void {
  if (turnCount > 1) process.stdout.write("\n");
  console.log(formatTurnHeader(turnCount));
  process.stdout.write(formatUserLabel());
}

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
   * @param turnCount - Current turn number
   * @returns Next message or null if user exits
   */
  async nextMessage(turnCount: number): Promise<string | null> {
    let input: string;

    if (this.isFirst && this.initialText.trim() !== "") {
      input = this.initialText;
      this.isFirst = false;
      printTurnHeader(turnCount);
      console.log(`${GRAY_PROMPT}${input}`);
    } else {
      this.isFirst = false;
      printTurnHeader(turnCount);

      // Loop until non-empty input (matches original behavior)
      do {
        input = await question(this.rl, GRAY_PROMPT);
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
 * Emit the next message from an array, printing the turn header.
 * @param messages - Message array
 * @param index - Current index (will be incremented)
 * @param turnCount - Current turn number
 * @returns The message and updated index, or null when exhausted
 */
function emitNextMessage(
  messages: string[],
  index: number,
  turnCount: number,
): { msg: string | null; nextIndex: number } {
  if (index >= messages.length) {
    return { msg: null, nextIndex: index };
  }

  const msg = messages[index] ?? null;

  if (msg) {
    printTurnHeader(turnCount);
    console.log(`${GRAY_PROMPT}${msg}`);
  }

  return { msg, nextIndex: index + 1 };
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
   * @param turnCount - Current turn number
   * @returns Next message or null when exhausted
   */
  async nextMessage(turnCount: number): Promise<string | null> {
    const { msg, nextIndex } = emitNextMessage(
      this.messages,
      this.index,
      turnCount,
    );

    this.index = nextIndex;

    return msg;
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
   * @param turnCount - Current turn number
   * @returns Next message or null when exhausted
   */
  async nextMessage(turnCount: number): Promise<string | null> {
    if (this.messages == null) {
      const content = await readFile(this.filePath, "utf-8");

      this.messages = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
    }

    const { msg, nextIndex } = emitNextMessage(
      this.messages,
      this.index,
      turnCount,
    );

    this.index = nextIndex;

    return msg;
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
  if (options.sequence && options.sequence.length > 0) {
    return new ArrayMessageSource(options.sequence);
  }

  if (options.file) {
    return new FileMessageSource(options.file);
  }

  return new InteractiveMessageSource(rl, initialText);
}

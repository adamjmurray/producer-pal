// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Split a scenario's judge criteria into separate requirements so each can be
 * asked as its own yes/no question.
 */

export interface Requirements {
  /** Text before the list; shared by every question */
  context: string;
  /** One entry per numbered item, continuation lines joined */
  items: string[];
  /** Text after the list (after a blank line); shared by every question */
  trailer: string;
}

const ITEM_START = /^\s*\d+\.\s+/;

/**
 * Split criteria on a numbered list. With no list, the whole prompt is the
 * context and there are no items.
 *
 * @param prompt - The scenario's llm_judge prompt
 * @returns Shared context, the numbered items, and any text after the list
 */
export function splitRequirements(prompt: string): Requirements {
  const context: string[] = [];
  const items: string[] = [];
  const trailer: string[] = [];
  let previousBlank = false;

  for (const line of prompt.split("\n")) {
    const blank = line.trim() === "";

    if (ITEM_START.test(line)) {
      items.push(line.replace(ITEM_START, "").trim());
    } else if (items.length === 0) {
      context.push(line);
    } else if (
      trailer.length > 0 ||
      (previousBlank && !blank && !/^\s/.test(line))
    ) {
      trailer.push(line);
    } else if (!blank) {
      items[items.length - 1] += ` ${line.trim()}`;
    }

    previousBlank = blank;
  }

  return {
    context: context.join("\n").trim(),
    items,
    trailer: trailer.join("\n").trim(),
  };
}

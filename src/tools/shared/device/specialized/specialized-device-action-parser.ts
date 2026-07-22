// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ParsedAction } from "./specialized-device-types.ts";

// Parser for the `actions` arg on update-device. Each action is a function-call
// string: a bare name (`reverse`) or `name(arg1, arg2, ...)`. Args are int,
// float, or quoted strings (single or double quotes). Commas inside quotes are
// respected. No nested calls. See dev/Specialized-Devices.md.

/**
 * Parse a single action string into a name and positional args.
 * @param input - Action string (e.g. `setModulation('Osc 1 Pos', 'Env 2', 0.5)`)
 * @returns Parsed action, or null if the string is malformed
 */
export function parseAction(input: string): ParsedAction | null {
  const trimmed = input.trim();

  const match = /^([A-Z_a-z]\w*)\s*(?:\((.*)\))?$/s.exec(trimmed);

  if (!match) {
    return null;
  }

  const name = match[1] as string;
  const argsStr = match[2];

  // Bare name (no parentheses) → no args.
  if (argsStr == null) {
    return { name, args: [] };
  }

  const args = parseArgList(argsStr);

  return args == null ? null : { name, args };
}

/**
 * Split an argument list on top-level commas (ignoring commas inside quotes)
 * and parse each token into a literal.
 * @param argsStr - The text between the parentheses
 * @returns Array of parsed literal args, or null if a token is malformed
 */
function parseArgList(argsStr: string): Array<string | number> | null {
  if (argsStr.trim() === "") {
    return [];
  }

  const tokens = splitArgs(argsStr);

  if (tokens == null) {
    return null;
  }

  const args: Array<string | number> = [];

  for (const token of tokens) {
    const parsed = parseArgToken(token.trim());

    if (parsed === INVALID) {
      return null;
    }

    args.push(parsed);
  }

  return args;
}

/**
 * Split an arg list into raw token strings, respecting quoted spans.
 * @param argsStr - The text between the parentheses
 * @returns Raw token strings, or null on an unterminated quote
 */
function splitArgs(argsStr: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i] as string;

    if (quote) {
      current += ch;

      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      tokens.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  if (quote) {
    return null;
  }

  tokens.push(current);

  return tokens;
}

const INVALID = Symbol("invalid-arg");

/**
 * Parse a single trimmed token into a string or number literal.
 * @param token - Trimmed token text
 * @returns Parsed value, or the INVALID sentinel
 */
function parseArgToken(token: string): string | number | typeof INVALID {
  if (token === "") {
    return INVALID;
  }

  // Quoted string: strip matching outer quotes.
  const first = token.at(0);

  if (first === '"' || first === "'") {
    if (token.length < 2 || token.at(-1) !== first) {
      return INVALID;
    }

    return token.slice(1, -1);
  }

  // Numeric literal (int or float).
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(token)) {
    return Number(token);
  }

  // Bare word: accept as a string literal (lenient — strings need not be
  // quoted when they contain no commas or whitespace ambiguity).
  return token;
}

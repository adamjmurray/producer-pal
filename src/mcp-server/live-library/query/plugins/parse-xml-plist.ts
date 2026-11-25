// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * A small reader for XML property lists (a bundle's Info.plist). It knows the
 * plist tags and nothing else: no DTDs, no CDATA. A binary plist is not XML,
 * so it reads as null.
 */

export type PlistValue =
  | string
  | number
  | boolean
  | PlistValue[]
  | { [key: string]: PlistValue };

interface Token {
  /** The tag's name, or "" for text between tags */
  tag: string;
  close: boolean;
  /** Like `<true/>` */
  self: boolean;
  text: string;
}

interface Cursor {
  tokens: Token[];
  pos: number;
}

// The declaration, comments and DOCTYPE match first, so they are skipped whole.
const TOKEN =
  /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z]+)[^>]*?(\/?)>|([^<]+)/g;
const ENTITY = /&(?:#(\d+)|#x([0-9a-fA-F]+)|(lt|gt|amp|quot|apos));/g;
const NAMED: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

/**
 * Read an XML plist.
 *
 * @param xml - The file's text
 * @returns The top-level value, or null when this isn't a readable XML plist
 */
export function parseXmlPlist(xml: string): PlistValue | null {
  if (!xml.includes("<plist")) {
    return null;
  }

  try {
    const cursor = {
      tokens: tokenize(xml),
      pos: 0,
    };

    if (take(cursor).tag !== "plist") {
      return null;
    }

    return readValue(cursor);
  } catch {
    return null;
  }
}

/**
 * @param xml - The plist's XML
 * @returns Its tags and text, leaving out the declaration, comments, DOCTYPE
 *   and the whitespace between tags
 */
function tokenize(xml: string): Token[] {
  return [...xml.matchAll(TOKEN)]
    .filter((match) =>
      match[4] == null ? match[2] != null : match[4].trim() !== "",
    )
    .map((match) => ({
      tag: match[2] ?? "",
      close: match[1] === "/",
      self: match[3] === "/",
      text: decode(match[4] ?? ""),
    }));
}

/**
 * @param text - Text with XML entities
 * @returns The text they stand for
 */
function decode(text: string): string {
  return text.replaceAll(
    ENTITY,
    (_match, decimal?: string, hex?: string, named?: string) =>
      named == null
        ? String.fromCodePoint(
            decimal == null
              ? Number.parseInt(hex as string, 16)
              : Number(decimal),
          )
        : (NAMED[named] as string),
  );
}

/**
 * @param cursor - Where we are in the tokens
 * @returns The next token, moving past it
 * @throws When there is none
 */
function take(cursor: Cursor): Token {
  const token = cursor.tokens[cursor.pos++];

  if (token == null) {
    throw new Error("the plist ends too early");
  }

  return token;
}

/**
 * Read the value that starts at the next token.
 *
 * @param cursor - Where we are in the tokens
 * @returns The value
 * @throws When the plist is malformed
 */
function readValue(cursor: Cursor): PlistValue {
  const open = take(cursor);

  if (open.close || open.tag === "") {
    throw new Error("a value was expected");
  }

  switch (open.tag) {
    case "dict":
      return readDict(open, cursor);
    case "array":
      return readArray(open, cursor);
    case "true":
    case "false":
      skipClose(open, cursor);

      return open.tag === "true";
    case "integer":
    case "real":
      return Number(readText(open, cursor));
    default:
      return readText(open, cursor);
  }
}

/**
 * @param open - The `<dict>` token
 * @param cursor - Where we are in the tokens
 * @returns The dict's entries
 */
function readDict(open: Token, cursor: Cursor): { [key: string]: PlistValue } {
  const dict: { [key: string]: PlistValue } = {};

  while (!open.self) {
    const key = take(cursor);

    if (key.close) {
      break;
    }

    if (key.tag !== "key") {
      throw new Error("a dict entry needs a key");
    }

    dict[readText(key, cursor)] = readValue(cursor);
  }

  return dict;
}

/**
 * @param open - The `<array>` token
 * @param cursor - Where we are in the tokens
 * @returns The array's items
 */
function readArray(open: Token, cursor: Cursor): PlistValue[] {
  const items: PlistValue[] = [];

  while (!open.self) {
    if (cursor.tokens[cursor.pos]?.close === true) {
      cursor.pos++;
      break;
    }

    items.push(readValue(cursor));
  }

  return items;
}

/**
 * @param open - An opening tag that holds text, like `<string>`
 * @param cursor - Where we are in the tokens
 * @returns The text inside it, up to the closing tag
 */
function readText(open: Token, cursor: Cursor): string {
  if (open.self) {
    return "";
  }

  const text = cursor.tokens[cursor.pos]?.tag === "" ? take(cursor).text : "";

  skipClose(open, cursor);

  return text;
}

/**
 * @param open - An opening tag
 * @param cursor - Where we are in the tokens
 * @throws When the tag isn't closed next
 */
function skipClose(open: Token, cursor: Cursor): void {
  if (open.self) {
    return;
  }

  const close = take(cursor);

  if (!close.close || close.tag !== open.tag) {
    throw new Error(`${open.tag} isn't closed`);
  }
}

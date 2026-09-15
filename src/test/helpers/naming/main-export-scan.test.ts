// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  namesItsFile,
  scanModuleSource,
} from "#src/test/helpers/naming/main-export-scan.ts";

/**
 * What the scan makes of one module
 * @param file - Repo-relative path
 * @param source - The module's source
 * @returns Its exported names and whether they name the file
 */
function scan(
  file: string,
  source: string,
): { names: string[]; named: boolean } {
  const entry = scanModuleSource(file, source);

  return { names: entry.names, named: namesItsFile(entry) };
}

describe("Main export scan", () => {
  it("should match a function declaration named for the file", () => {
    expect(
      scan("src/tools/update-clip.ts", "export function updateClip() {}"),
    ).toStrictEqual({ names: ["updateClip"], named: true });
  });

  it("should match an arrow const, so hooks count", () => {
    expect(
      scan("webui/src/hooks/use-chat.ts", "export const useChat = () => {};"),
    ).toStrictEqual({ names: ["useChat"], named: true });
  });

  it("should compare a PascalCase file against a default-exported component", () => {
    const source = [
      "const ChatHeader = () => null;",
      "export default ChatHeader;",
    ].join("\n");

    expect(scan("webui/src/components/ChatHeader.tsx", source)).toStrictEqual({
      names: ["ChatHeader"],
      named: true,
    });
  });

  it("should count a default-exported function declaration", () => {
    expect(
      scan(
        "src/portal/pkce-challenge.ts",
        "export default function pkceChallenge(): never {}",
      ),
    ).toStrictEqual({ names: ["pkceChallenge"], named: true });
  });

  it("should count a class, and a wrapped component", () => {
    const source = [
      "export class ChatSdkClient {}",
      "export const Memoized = memo(() => null);",
      "export function detectToolLimitReached() {}",
    ].join("\n");

    expect(scan("webui/src/chat/sdk/client.ts", source)).toStrictEqual({
      names: ["ChatSdkClient", "Memoized", "detectToolLimitReached"],
      named: true,
    });
  });

  it("should take the exported name of a local, and skip a re-export", () => {
    const source = [
      "function readIt() {}",
      "export { readIt as parseThing };",
      'export { somethingElse } from "./other.ts";',
    ].join("\n");

    expect(scan("src/notation/parse-thing.ts", source)).toStrictEqual({
      names: ["parseThing"],
      named: true,
    });
  });

  it("should match a noun/verb pair by prefix", () => {
    expect(
      scan("src/notation/barbeat-parser.ts", "export function parse() {}"),
    ).toStrictEqual({ names: ["parse"], named: true });
  });

  it("should name nothing when a module exports no function or class", () => {
    const source = [
      "export const MAX_NOTES = 128;",
      "export interface LimitsConfig {",
      "  max: number;",
      "}",
    ].join("\n");

    expect(scan("src/shared/limits-config.ts", source).names).toStrictEqual([]);
  });

  it("should flag exports that share no word with the file", () => {
    expect(
      scan(
        "src/shared/max/v8-timers.ts",
        "export async function waitUntil() {}",
      ),
    ).toStrictEqual({ names: ["waitUntil"], named: false });
  });
});

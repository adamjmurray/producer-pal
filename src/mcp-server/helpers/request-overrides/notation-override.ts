// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Notation } from "#src/shared/notation.ts";
import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import { type RequestOverrides } from "./request-overrides.ts";

/**
 * Wrap a callLiveApi so every call carries the caller's notation as a request
 * override, making the Node-resolved notation authoritative for how V8 parses
 * and formats clip notes.
 *
 * Without this, notation would reach only the *descriptions* — tool schemas and
 * the skills blob — while execution stayed on V8's session global, so a request
 * taught stark would hand stark note strings to a bar|beat parser. V8 has no
 * per-request setter for this; the value rides in the same contextJSON blob as
 * `timeoutMs`/`compactOutput` and lands on the per-request ToolContext, which is
 * what the clip tools read.
 *
 * An explicit caller-supplied override still wins (it is merged after), so this
 * only fills the slot when nobody else set one.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getNotation - Reads the notation in effect for this caller
 * @returns A callLiveApi whose calls carry the notation override
 */
export function withNotationOverride(
  inner: CallLiveApiFunction,
  getNotation: () => Notation,
): CallLiveApiFunction {
  return (tool: string, args: object, overrides?: RequestOverrides) =>
    inner(tool, args, { notation: getNotation(), ...overrides });
}

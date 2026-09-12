// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import { type RequestOverrides } from "./request-overrides.ts";

/**
 * Wrap a callLiveApi so every call carries the caller's per-request settings as
 * request overrides, making the Node-resolved values authoritative for how V8
 * executes and formats the call.
 *
 * Without this, notation would reach only the *descriptions* — tool schemas and
 * the skills blob — while execution stayed on V8's session global, so a request
 * taught stark would hand stark note strings to a bar|beat parser. V8 has no
 * per-request setter for these; the values ride in the same contextJSON blob as
 * `timeoutMs` and land on the per-request ToolContext, which is what the tools
 * read.
 *
 * An explicit caller-supplied override still wins (it is merged after), so this
 * only fills a slot nobody else set.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getDefaults - Reads the overrides in effect for this caller
 * @returns A callLiveApi whose calls carry those overrides
 */
export function withDefaultOverrides(
  inner: CallLiveApiFunction,
  getDefaults: () => RequestOverrides,
): CallLiveApiFunction {
  return (tool: string, args: object, overrides?: RequestOverrides) =>
    inner(tool, args, { ...getDefaults(), ...overrides });
}

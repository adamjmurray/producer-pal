// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { type Tool } from "@modelcontextprotocol/sdk/types.js";
import { type z } from "zod";
import {
  type CallLiveApiFunction,
  createMcpServer,
} from "#src/mcp-server/create-mcp-server.ts";
import { listedInputSchema } from "#src/tools/shared/schema/listed-input-schema.ts";
import { type Notation } from "#src/shared/notation.ts";
import { ALL_TOOL_IDS } from "#src/shared/tool-groups.ts";

export interface FallbackTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: Tool["annotations"];
  execution?: Tool["execution"];
  _meta?: Tool["_meta"];
  outputSchema?: object;
}

/** The SDK's private per-tool record, as its `tools/list` handler reads it. */
interface RegisteredToolInfo {
  title?: string;
  description: string;
  inputSchema?: z.ZodObject;
  outputSchema?: z.ZodObject;
  annotations?: Tool["annotations"];
  execution?: Tool["execution"];
  _meta?: Tool["_meta"];
  enabled: boolean;
}

export interface FallbackToolsOptions {
  smallModelMode?: boolean;
  notation?: Notation;
  liveApiEnabled?: boolean;
  disabledTools?: string[];
}

/**
 * Build the tool list the portal answers `tools/list` with while the device is
 * unreachable, so a client gets setup guidance instead of a hard failure.
 *
 * Built from the same createMcpServer logic the live server uses, threading every
 * portal option — small-model mode, notation, liveApiEnabled, and the withheld
 * tools — so the offline list matches what the live server would return for this
 * config. Clients cache the tool list and the stateless server has no
 * tools/list_changed signal to force a re-fetch, so an inaccurate offline list
 * (missing a forced-on ppal-live-api, or listing tools this client withheld) can
 * persist even after the device comes online.
 *
 * @param options - The portal's resolved options
 * @returns The fallback tools, in tools/list response shape
 */
export function buildFallbackTools(options: FallbackToolsOptions = {}): {
  tools: FallbackTool[];
} {
  const server = createMcpServer(null as unknown as CallLiveApiFunction, {
    smallModelMode: options.smallModelMode,
    notation: options.notation,
    liveApiEnabled: options.liveApiEnabled,
    tools: enabledToolWhitelist(options.disabledTools),
  });

  // No filtering here: createMcpServer already applied the opt-in gating
  // (ppal-live-api is registered only when liveApiEnabled).
  return { tools: listRegisteredTools(server) };
}

/**
 * Every tool on the server, built field for field as the SDK's `tools/list`
 * handler builds it, plus the device's `inputSchema` trim. Reads the SDK's
 * private `_registeredTools`.
 *
 * @param server - A server with its tools registered
 * @returns The tools, as the device lists them
 */
export function listRegisteredTools(server: McpServer): FallbackTool[] {
  const registeredTools = (
    server as unknown as {
      _registeredTools: Record<string, RegisteredToolInfo>;
    }
  )._registeredTools;

  return Object.entries(registeredTools)
    .filter(([, tool]) => tool.enabled)
    .map(([name, tool]) => listedTool(name, tool));
}

/**
 * @param name - The tool's name
 * @param tool - The SDK's record of it
 * @returns The tool's `tools/list` entry, keys in the SDK's order
 */
function listedTool(name: string, tool: RegisteredToolInfo): FallbackTool {
  const entry = {
    name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema
      ? listedInputSchema(tool.inputSchema)
      : { type: "object", properties: {} },
    annotations: tool.annotations,
    execution: tool.execution,
    _meta: tool._meta,
    // The device trims only inputSchema, so this stays as the SDK makes it.
    outputSchema: tool.outputSchema
      ? toJsonSchemaCompat(tool.outputSchema, {
          strictUnions: true,
          pipeStrategy: "output",
        })
      : undefined,
  };

  // The device's JSON drops undefined fields, so leave them out here too.
  return Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined),
  ) as unknown as FallbackTool;
}

/**
 * The withheld tools turned into the whitelist `createMcpServer` wants, or
 * undefined when nothing is withheld. Complemented over the full catalog rather
 * than `TOOL_NAMES`, so `ppal-live-api` is covered too.
 *
 * @param disabledTools - Tool names this client withholds, if any
 * @returns The tools to register, or undefined for "all of them"
 */
function enabledToolWhitelist(disabledTools?: string[]): string[] | undefined {
  if (disabledTools == null || disabledTools.length === 0) {
    return undefined;
  }

  const disabled = new Set(disabledTools);

  return ALL_TOOL_IDS.filter((name) => !disabled.has(name));
}

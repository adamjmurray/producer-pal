// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import {
  type CallLiveApiFunction,
  createMcpServer,
} from "#src/mcp-server/create-mcp-server.ts";
import { type Notation } from "#src/shared/notation.ts";
import { ALL_TOOL_IDS } from "#src/shared/tool-groups.ts";

export interface FallbackTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
}

interface RegisteredToolInfo {
  title?: string;
  description: string;
  inputSchema?: z.ZodType;
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
  const tools: FallbackTool[] = [];

  // Access private _registeredTools for fallback tool list. No filtering here:
  // createMcpServer already applied the opt-in gating (ppal-live-api is
  // registered only when liveApiEnabled), so the list mirrors the live server.
  const registeredTools = (
    server as unknown as {
      _registeredTools: Record<string, RegisteredToolInfo>;
    }
  )._registeredTools;

  for (const [name, toolInfo] of Object.entries(registeredTools)) {
    tools.push({
      name: name,
      title: toolInfo.title,
      description: toolInfo.description,
      inputSchema: toolInfo.inputSchema
        ? z.toJSONSchema(toolInfo.inputSchema)
        : {
            type: "object",
            properties: {},
          },
    });
  }

  return { tools };
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
  if (disabledTools == null || disabledTools.length === 0) return undefined;

  const disabled = new Set(disabledTools);

  return ALL_TOOL_IDS.filter((name) => !disabled.has(name));
}

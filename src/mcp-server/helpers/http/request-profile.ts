// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Request } from "express";
import {
  DISABLED_TOOLS_HEADER,
  FORMAT_HEADER,
  LIVE_API_HEADER,
  SMALL_MODEL_MODE_HEADER,
  resolveCompactOutput,
  resolveEnabledTools,
  resolveLiveApiEnabled,
  resolveSmallModelMode,
} from "#src/shared/config.ts";
import {
  NOTATION_HEADER,
  resolveNotation,
  type Notation,
} from "#src/shared/notation.ts";
import { withLiveApiTool } from "#src/shared/tool-groups.ts";

/** The device globals a request falls back to for any header it omits. */
export interface RequestProfileDefaults {
  tools: readonly string[];
  notation: Notation;
  smallModelMode: boolean;
  liveApiEnabled: boolean;
}

/** The per-request settings resolved for one request. */
export interface RequestProfile {
  tools: string[];
  notation: Notation;
  smallModelMode: boolean;
  liveApiEnabled: boolean;
  /** undefined ⇒ no header sent; leave the device's own format alone. */
  compactOutput: boolean | undefined;
}

/**
 * Resolve one caller's profile from the per-request headers, falling back to
 * the device globals for whichever are absent.
 *
 * Every HTTP surface that serves tools reads the profile through here — POST
 * /mcp, the REST tool endpoints, and GET /subagent-briefing — so the settings
 * cannot drift apart on which headers they honor. They did drift once: REST
 * shipped reading only the toolset header, which left an Agent Skill no way to
 * pick a notation except a device-wide POST /config that clobbered every other
 * connected client.
 *
 * The Direct Live API opt-in is resolved BEFORE the toolset subtraction, so a
 * request that enables the tool and then withholds it by name ends up without
 * it. Nothing here can grant a tool past DISABLED_TOOLS_HEADER.
 *
 * @param req - Express request
 * @param defaults - The device globals to fall back to
 * @returns The resolved settings for this request
 */
export function resolveRequestProfile(
  req: Request,
  defaults: RequestProfileDefaults,
): RequestProfile {
  const liveApiEnabled = resolveLiveApiEnabled(
    req.get(LIVE_API_HEADER),
    defaults.liveApiEnabled,
  );

  // Only touch the toolset when the header actually changed the flag. An
  // explicit POST /config whitelist can omit ppal-live-api while the device
  // flag stays on, and a request that didn't ask must not hand it back.
  const baseTools =
    liveApiEnabled === defaults.liveApiEnabled
      ? defaults.tools
      : withLiveApiTool(defaults.tools, liveApiEnabled);

  return {
    tools: resolveEnabledTools(req.get(DISABLED_TOOLS_HEADER), baseTools),
    notation: resolveNotation(req.get(NOTATION_HEADER), defaults.notation),
    smallModelMode: resolveSmallModelMode(
      req.get(SMALL_MODEL_MODE_HEADER),
      defaults.smallModelMode,
    ),
    liveApiEnabled,
    compactOutput: resolveCompactOutput(req.get(FORMAT_HEADER)),
  };
}

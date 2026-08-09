// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Request } from "express";
import {
  DISABLED_TOOLS_HEADER,
  SMALL_MODEL_MODE_HEADER,
  resolveEnabledTools,
  resolveSmallModelMode,
} from "#src/shared/config.ts";
import {
  NOTATION_HEADER,
  resolveNotation,
  type Notation,
} from "#src/shared/notation.ts";

/** The device globals a request falls back to for any header it omits. */
export interface RequestProfileDefaults {
  tools: readonly string[];
  notation: Notation;
  smallModelMode: boolean;
}

/** The three per-request settings resolved for one request. */
export interface RequestProfile {
  tools: string[];
  notation: Notation;
  smallModelMode: boolean;
}

/**
 * Resolve one caller's profile from the three per-request headers, falling back
 * to the device globals for whichever are absent.
 *
 * Every HTTP surface that serves tools reads the profile through here — POST
 * /mcp, the REST tool endpoints, and GET /subagent-briefing — so the three
 * cannot drift apart on which headers they honor. They did drift once: REST
 * shipped reading only the toolset header, which left an Agent Skill no way to
 * pick a notation except a device-wide POST /config that clobbered every other
 * connected client.
 *
 * @param req - Express request
 * @param defaults - The device globals to fall back to
 * @returns The toolset, notation, and small-model mode for this request
 */
export function resolveRequestProfile(
  req: Request,
  defaults: RequestProfileDefaults,
): RequestProfile {
  return {
    tools: resolveEnabledTools(req.get(DISABLED_TOOLS_HEADER), defaults.tools),
    notation: resolveNotation(req.get(NOTATION_HEADER), defaults.notation),
    smallModelMode: resolveSmallModelMode(
      req.get(SMALL_MODEL_MODE_HEADER),
      defaults.smallModelMode,
    ),
  };
}

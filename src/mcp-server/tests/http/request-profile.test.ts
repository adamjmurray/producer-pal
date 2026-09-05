// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Request } from "express";
import { describe, expect, it } from "vitest";
import { LIVE_API_HEADER } from "#src/shared/config.ts";
import { DEFAULT_NOTATION } from "#src/shared/notation.ts";
import { LIVE_API_TOOL_ID } from "#src/shared/tool-groups.ts";
import {
  resolveRequestProfile,
  type RequestProfileDefaults,
} from "../../helpers/http/request-profile.ts";

/**
 * A minimal Express request exposing only the given headers, matched
 * case-insensitively the way Express's req.get does.
 * @param headers - The header values to expose, keyed by header name
 * @returns A Request-shaped stub
 */
function mockReq(headers: Record<string, string>): Request {
  const lower = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    get(name: string): string | undefined {
      return lower.get(name.toLowerCase());
    },
  } as unknown as Request;
}

const STANDARD_TOOLS = ["ppal-connect", "ppal-read-live-set"];

/**
 * Device-global defaults, with overrides for the fields a test cares about.
 * @param overrides - Fields to override on the base defaults
 * @returns A complete RequestProfileDefaults
 */
function defaults(
  overrides: Partial<RequestProfileDefaults> = {},
): RequestProfileDefaults {
  return {
    tools: STANDARD_TOOLS,
    notation: DEFAULT_NOTATION,
    smallModelMode: false,
    liveApiEnabled: false,
    ...overrides,
  };
}

// A curated `config.tools` whitelist doesn't have to agree with
// `config.liveApiEnabled` (validateTools only checks names) — so the flag and
// the toolset can independently disagree with an explicit per-request header.
describe("resolveRequestProfile — Direct Live API opt-in vs. a curated toolset", () => {
  it("grants the tool to an explicit opt-in even when the flag is already on", () => {
    const profile = resolveRequestProfile(
      mockReq({ [LIVE_API_HEADER]: "true" }),
      defaults({ liveApiEnabled: true, tools: STANDARD_TOOLS }),
    );

    expect(profile.tools).toContain(LIVE_API_TOOL_ID);
  });

  it("withholds the tool when no header asks, even though the flag is on", () => {
    const profile = resolveRequestProfile(
      mockReq({}),
      defaults({ liveApiEnabled: true, tools: STANDARD_TOOLS }),
    );

    expect(profile.tools).not.toContain(LIVE_API_TOOL_ID);
  });

  it("withholds the tool from an explicit opt-out even when the curated toolset carries it and the flag is already off", () => {
    const profile = resolveRequestProfile(
      mockReq({ [LIVE_API_HEADER]: "false" }),
      defaults({
        liveApiEnabled: false,
        tools: [...STANDARD_TOOLS, LIVE_API_TOOL_ID],
      }),
    );

    expect(profile.tools).not.toContain(LIVE_API_TOOL_ID);
  });

  it("leaves a curated toolset that already carries the tool alone when no header asks", () => {
    const profile = resolveRequestProfile(
      mockReq({}),
      defaults({
        liveApiEnabled: false,
        tools: [...STANDARD_TOOLS, LIVE_API_TOOL_ID],
      }),
    );

    expect(profile.tools).toContain(LIVE_API_TOOL_ID);
  });
});

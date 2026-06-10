// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for run-env.ts
 */

import { describe, it, expect } from "vitest";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import {
  buildRunEnv,
  envLabel,
  resolveTools,
  toFullToolName,
  type RunEnv,
} from "./run-env.ts";

const LIVE_API = toolDefLiveApi.toolName;

describe("resolveTools", () => {
  it("returns all standard tools when no argument is given", () => {
    expect(resolveTools(undefined, false)).toStrictEqual([...TOOL_NAMES]);
  });

  it("does not include the Live API tool by default", () => {
    expect(resolveTools(undefined, false)).not.toContain(LIVE_API);
  });

  it("resolves short names to full ppal- names", () => {
    expect(resolveTools("connect,create-clip", false)).toStrictEqual([
      "ppal-connect",
      "ppal-create-clip",
    ]);
  });

  it("accepts full names and trims whitespace", () => {
    expect(
      resolveTools(" ppal-connect , ppal-read-track ", false),
    ).toStrictEqual(["ppal-connect", "ppal-read-track"]);
  });

  it("dedupes repeated names", () => {
    expect(resolveTools("connect,ppal-connect,connect", false)).toStrictEqual([
      "ppal-connect",
    ]);
  });

  it("unions the Live API tool when liveApi is true", () => {
    const result = resolveTools("connect", true);

    expect(result).toContain("ppal-connect");
    expect(result).toContain(LIVE_API);
  });

  it("does not duplicate the Live API tool when also named explicitly", () => {
    const result = resolveTools("connect,ppal-live-api", true);

    expect(result.filter((t) => t === LIVE_API)).toHaveLength(1);
  });

  it("throws on an unknown tool name", () => {
    expect(() => resolveTools("connect,bogus-tool", false)).toThrow(
      /Unknown tool: ppal-bogus-tool/,
    );
  });
});

describe("toFullToolName", () => {
  it("prefixes a short name", () => {
    expect(toFullToolName("connect")).toBe("ppal-connect");
  });

  it("passes through an already-full name", () => {
    expect(toFullToolName("ppal-create-clip")).toBe("ppal-create-clip");
  });
});

describe("buildRunEnv", () => {
  it("defaults to a non-small-model, compact, full-tools, no-live-api env", () => {
    expect(buildRunEnv({})).toStrictEqual({
      smallModelMode: false,
      jsonOutput: false,
      tools: [...TOOL_NAMES],
      liveApiEnabled: false,
    });
  });

  it("maps the flags through", () => {
    const env = buildRunEnv({ smallModel: true, json: true });

    expect(env.smallModelMode).toBe(true);
    expect(env.jsonOutput).toBe(true);
  });

  it("liveApi sets both the flag and the tool", () => {
    const env = buildRunEnv({ liveApi: true });

    expect(env.liveApiEnabled).toBe(true);
    expect(env.tools).toContain(LIVE_API);
  });

  it("applies an explicit tool subset", () => {
    const env = buildRunEnv({ tools: "connect,read-track" });

    expect(env.tools).toStrictEqual(["ppal-connect", "ppal-read-track"]);
  });
});

describe("envLabel", () => {
  function makeEnv(overrides: Partial<RunEnv> = {}): RunEnv {
    return {
      smallModelMode: false,
      jsonOutput: false,
      tools: [...TOOL_NAMES],
      liveApiEnabled: false,
      ...overrides,
    };
  }

  it("labels the all-default environment 'default'", () => {
    expect(envLabel(makeEnv())).toBe("default");
  });

  it("labels small-model mode", () => {
    expect(envLabel(makeEnv({ smallModelMode: true }))).toBe("small-model");
  });

  it("labels JSON output", () => {
    expect(envLabel(makeEnv({ jsonOutput: true }))).toBe("json");
  });

  it("labels live-api without counting it as a tool subset", () => {
    expect(
      envLabel(
        makeEnv({ liveApiEnabled: true, tools: [...TOOL_NAMES, LIVE_API] }),
      ),
    ).toBe("live-api");
  });

  it("labels a reduced tool subset with its size", () => {
    expect(
      envLabel(makeEnv({ tools: ["ppal-connect", "ppal-read-track"] })),
    ).toBe("tools-2");
  });

  it("hyphenates multiple active modifiers deterministically", () => {
    expect(envLabel(makeEnv({ smallModelMode: true, jsonOutput: true }))).toBe(
      "small-model-json",
    );
  });
});

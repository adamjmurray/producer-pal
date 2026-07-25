// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISABLED_TOOLS_HEADER,
  SMALL_MODEL_MODE_HEADER,
} from "#src/shared/config";
import { NOTATION_HEADER } from "#src/shared/notation";
import {
  SPAWN_SUBAGENT_TOOL_NAME,
  createSpawnSubagentTool,
} from "#webui/chat/sdk/subagent/spawn-subagent-tool";
import {
  WORKER_WITHHELD_TOOLS,
  fetchSubagentBriefing,
  withBriefing,
  withheldToolsApplied,
} from "#webui/chat/sdk/subagent/subagent-briefing";
import { type ChatClientConfig, type ChatMessage } from "#webui/chat/sdk/types";
import { createConfig } from "#webui/chat/sdk/tests/client-test-helpers";

vi.mock(import("#webui/utils/mcp-url"), () => ({
  getSubagentBriefingUrl: () => "http://localhost:3350/subagent-briefing",
}));

const BRIEFING = "# Producer Pal Skills\n\n...\n\n## You are a subagent";

/**
 * Stub global fetch with a JSON response.
 * @param body - The parsed body to resolve with
 * @param ok - Whether the response is a 2xx
 */
function mockFetchJson(body: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: async () => body }),
  );
}

/**
 * The headers the last fetch call sent.
 * @returns The header record
 */
function sentHeaders(): Record<string, string> {
  const call = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];

  return call[1].headers as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSubagentBriefing", () => {
  it("returns the briefing text on success", async () => {
    mockFetchJson({ briefing: BRIEFING });

    expect(await fetchSubagentBriefing(createConfig())).toBe(BRIEFING);
  });

  it("sends the worker's profile on the same three per-request headers", async () => {
    mockFetchJson({ briefing: BRIEFING });

    await fetchSubagentBriefing(
      createConfig({
        notation: "stark",
        smallModelMode: true,
        enabledTools: { "ppal-library": false, "ppal-read-clip": true },
      }),
    );

    expect(sentHeaders()).toStrictEqual({
      [NOTATION_HEADER]: "stark",
      [SMALL_MODEL_MODE_HEADER]: "true",
      [DISABLED_TOOLS_HEADER]: "ppal-library",
    });
  });

  it("sends no header for a profile with no opinion, so the server globals win", async () => {
    mockFetchJson({ briefing: BRIEFING });

    await fetchSubagentBriefing(createConfig());

    expect(sentHeaders()).toStrictEqual({});
  });

  it("returns null on a non-2xx (Live unreachable) so the caller falls back", async () => {
    mockFetchJson({ error: "Ableton Live is not running" }, false);

    expect(await fetchSubagentBriefing(createConfig())).toBeNull();
  });

  it("returns null when the server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    expect(await fetchSubagentBriefing(createConfig())).toBeNull();
  });

  it("returns null for a malformed or empty briefing", async () => {
    mockFetchJson({ briefing: "   " });
    expect(await fetchSubagentBriefing(createConfig())).toBeNull();

    vi.unstubAllGlobals();
    mockFetchJson({ briefing: 42 });
    expect(await fetchSubagentBriefing(createConfig())).toBeNull();
  });
});

describe("withheldToolsApplied", () => {
  it("switches off the tools the briefing replaces", () => {
    const narrowed = withheldToolsApplied(createConfig());

    for (const tool of WORKER_WITHHELD_TOOLS) {
      expect(narrowed.enabledTools?.[tool]).toBe(false);
    }
  });

  it("leaves the rest of the toolset alone and doesn't mutate the input", () => {
    const config = createConfig({
      enabledTools: { "ppal-read-clip": true, "ppal-connect": true },
    });
    const narrowed = withheldToolsApplied(config);

    expect(narrowed.enabledTools?.["ppal-read-clip"]).toBe(true);
    expect(config.enabledTools?.["ppal-connect"]).toBe(true);
  });
});

describe("withBriefing", () => {
  it("appends to the inherited system instruction rather than replacing it", () => {
    const briefed = withBriefing(
      createConfig({ systemInstruction: "You are an assistant." }),
      BRIEFING,
    );

    expect(briefed.systemInstruction).toBe(
      `You are an assistant.\n\n${BRIEFING}`,
    );
  });

  it("is the whole system instruction when nothing was inherited", () => {
    expect(withBriefing(createConfig(), BRIEFING).systemInstruction).toBe(
      BRIEFING,
    );
    expect(
      withBriefing(createConfig({ systemInstruction: "  " }), BRIEFING)
        .systemInstruction,
    ).toBe(BRIEFING);
  });
});

describe("spawn_subagent briefing wiring", () => {
  let workerConfig: ChatClientConfig | undefined;
  let getBriefing: ReturnType<typeof vi.fn>;

  /**
   * Spawn one worker and capture the config it ran under.
   * @param config - The orchestrator config to clone
   */
  async function spawn(config?: ChatClientConfig): Promise<void> {
    const tool = createSpawnSubagentTool({
      config: config ?? createConfig({ systemInstruction: "Base prompt." }),
      runWorker: (options) => {
        workerConfig = options.workerConfig;

        return Promise.resolve([
          { role: "assistant", content: "done" },
        ] as ChatMessage[]);
      },
      spawnState: { count: 0, nextIndex: 0, active: new Set<number>() },
      getBriefing: getBriefing as unknown as (
        c: ChatClientConfig,
      ) => Promise<string | null>,
    });

    await tool.execute?.({ task: "write a bassline" }, {
      toolCallId: "tc1",
      messages: [],
    } as never);
  }

  beforeEach(() => {
    workerConfig = undefined;
    getBriefing = vi.fn().mockResolvedValue(BRIEFING);
  });

  it("briefs the worker and withholds the tools the briefing replaces", async () => {
    await spawn();

    expect(workerConfig?.systemInstruction).toBe(`Base prompt.\n\n${BRIEFING}`);

    for (const tool of WORKER_WITHHELD_TOOLS) {
      expect(workerConfig?.enabledTools?.[tool]).toBe(false);
    }
  });

  it("asks for the briefing with the tools already withheld", async () => {
    // Otherwise the worker would be taught ppal-context, which it won't have.
    await spawn();

    const requested = getBriefing.mock.calls[0]?.[0] as ChatClientConfig;

    for (const tool of WORKER_WITHHELD_TOOLS) {
      expect(requested.enabledTools?.[tool]).toBe(false);
    }
  });

  it("keeps ppal-connect when no briefing came back", async () => {
    // A worker with neither a briefing nor a way to connect knows nothing about
    // the Live Set it is about to edit.
    getBriefing.mockResolvedValue(null);

    await spawn();

    expect(workerConfig?.systemInstruction).toBe("Base prompt.");
    expect(workerConfig?.enabledTools?.["ppal-connect"]).toBeUndefined();
  });

  it("still applies the recursion guard over a briefed toolset", async () => {
    await spawn(
      createConfig({ enabledTools: { [SPAWN_SUBAGENT_TOOL_NAME]: true } }),
    );

    expect(workerConfig?.enabledTools?.[SPAWN_SUBAGENT_TOOL_NAME]).toBe(false);
  });

  it("asks for the briefing in the preset's notation, not the orchestrator's", async () => {
    // The last link of the preset-notation chain: a stark preset has to reach
    // the config the briefing fetch derives its headers from, or the worker
    // would be taught bar|beat and then handed stark note strings.
    await spawn(
      createConfig({
        notation: "barbeat",
        subagentConfig: {
          model: { modelId: "cheap", provider: "openai" } as never,
          smallModelMode: false,
          notation: "stark",
        },
      }),
    );

    const requested = getBriefing.mock.calls[0]?.[0] as ChatClientConfig;

    expect(requested.notation).toBe("stark");
    // And the same config runs the worker, so its MCP client sends it too.
    expect(workerConfig?.notation).toBe("stark");
  });
});

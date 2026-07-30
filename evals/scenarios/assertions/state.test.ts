// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for state.ts - State assertion with mocked MCP client
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getNotation, setConfig } from "#evals/shared/config.ts";
import { DEFAULT_NOTATION } from "#src/shared/notation.ts";
import { type StateAssertion, type EvalTurnResult } from "../types.ts";
import { assertState } from "./state.ts";

// The factory is hoisted above the imports, so it must NOT reference imported
// bindings like DEFAULT_NOTATION (ReferenceError once another file isn't loading
// the module first to mask it). Set the default resolved value in beforeEach.
vi.mock(import("#evals/shared/config.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  setConfig: vi.fn().mockResolvedValue(undefined),
  getNotation: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getNotation).mockResolvedValue(DEFAULT_NOTATION);
});

/** Type for state assertion details */
interface StateDetails {
  actual?: unknown;
  expected?: unknown;
  error?: string;
}

/**
 * Create a mock MCP client whose callTool resolves to MCP text content
 *
 * @param text - The text content to wrap
 * @returns Mock Client with callTool method
 */
function textClient(text: string): Client {
  return {
    callTool: vi.fn().mockResolvedValue({ content: [{ text }] }),
  } as unknown as Client;
}

/**
 * Create a mock MCP client that returns `value` JSON-serialized
 *
 * @param value - The value to serialize into the MCP text content
 * @returns Mock Client with callTool method
 */
function jsonClient(value: unknown): Client {
  return textClient(JSON.stringify(value));
}

/**
 * Create a mock MCP client whose callTool rejects
 *
 * @param error - The rejection value
 * @returns Mock Client with callTool method
 */
function throwingClient(error: unknown): Client {
  return {
    callTool: vi.fn().mockRejectedValue(error),
  } as unknown as Client;
}

/**
 * Run a state assertion; `type: "state"` is implied
 *
 * @param assertion - The assertion minus its discriminant
 * @param client - Mock MCP client to read state through
 * @param turns - Completed turns passed to the assertion
 * @returns The assertion result
 */
function runState(
  assertion: Omit<StateAssertion, "type">,
  client: Client,
  turns: EvalTurnResult[] = [],
) {
  return assertState({ type: "state", ...assertion }, turns, client);
}

describe("assertState", () => {
  describe("object matching with partialMatch", () => {
    it("passes when state matches expected object", async () => {
      const client = jsonClient({ name: "Track 1", muted: false });

      const result = await runState(
        {
          tool: "read-track",
          args: { trackId: "1" },
          expect: { name: "Track 1" },
        },
        client,
      );

      expect(result.earned).toBe(result.maxScore);
      expect(result.message).toContain("passed");
      expect(client.callTool).toHaveBeenCalledWith({
        name: "read-track",
        arguments: { trackId: "1" },
      });
    });

    it("passes with partial match on nested objects", async () => {
      const result = await runState(
        {
          tool: "read-track",
          args: { trackId: "2" },
          expect: { track: { name: "Bass" } },
        },
        jsonClient({
          track: { name: "Bass", volume: 0.8 },
          clips: [{ id: "1" }],
        }),
      );

      expect(result.earned).toBe(result.maxScore);
    });

    it("fails when state does not match expected", async () => {
      const result = await runState(
        {
          tool: "read-track",
          args: { trackId: "1" },
          expect: { name: "Track 2" },
        },
        jsonClient({ name: "Track 1", muted: true }),
      );

      expect(result.earned).toBe(0);
      expect(result.message).toContain("failed");
      const details = result.details as StateDetails;

      expect(details.actual).toStrictEqual({
        name: "Track 1",
        muted: true,
      });
      expect(details.expected).toStrictEqual({ name: "Track 2" });
    });

    it("fails when expected field is missing", async () => {
      const result = await runState(
        { tool: "read-track", args: { trackId: "1" }, expect: { volume: 0.5 } },
        jsonClient({ name: "Track 1" }),
      );

      expect(result.earned).toBe(0);
    });
  });

  describe("custom expect function", () => {
    const countAbove3 = (result: unknown) => {
      const data = result as { count: number };

      return data.count > 3;
    };

    it("passes when custom function returns true", async () => {
      const result = await runState(
        { tool: "count-tracks", args: {}, expect: countAbove3 },
        jsonClient({ count: 5 }),
      );

      expect(result.earned).toBe(result.maxScore);
      const details = result.details as StateDetails;

      expect(details.expected).toBe("(custom function)");
    });

    it("fails when custom function returns false", async () => {
      const result = await runState(
        { tool: "count-tracks", args: {}, expect: countAbove3 },
        jsonClient({ count: 2 }),
      );

      expect(result.earned).toBe(0);
    });
  });

  describe("non-JSON text handling", () => {
    it("handles plain text response", async () => {
      const result = await runState(
        {
          tool: "ppal-connect",
          args: {},
          expect: (value) => typeof value === "string",
        },
        textClient("Connected to Ableton"),
      );

      expect(result.earned).toBe(result.maxScore);
      const details = result.details as StateDetails;

      expect(details.actual).toBe("Connected to Ableton");
    });

    it("falls back to string when JSON parsing fails", async () => {
      const result = await runState(
        {
          tool: "some-tool",
          args: {},
          expect: (value) => value === "Not valid JSON {",
        },
        textClient("Not valid JSON {"),
      );

      expect(result.earned).toBe(result.maxScore);
    });
  });

  describe("error handling", () => {
    it("returns failed result when tool call throws", async () => {
      const result = await runState(
        {
          tool: "read-track",
          args: { trackId: "1" },
          expect: { name: "Track 1" },
        },
        throwingClient(new Error("Connection refused")),
      );

      expect(result.earned).toBe(0);
      expect(result.message).toContain("error");
      expect(result.message).toContain("Connection refused");
      const details = result.details as StateDetails;

      expect(details.error).toContain("Connection refused");
    });

    it("handles non-Error exceptions", async () => {
      const result = await runState(
        { tool: "read-track", args: { trackId: "1" }, expect: {} },
        throwingClient("string error"),
      );

      expect(result.earned).toBe(0);
      const details = result.details as StateDetails;

      expect(details.error).toContain("string error");
    });
  });

  describe("dynamic args from turns", () => {
    it("resolves args from a function of the completed turns", async () => {
      const client = jsonClient({ ok: true });

      await runState(
        {
          tool: "ppal-read-clip",
          args: (turns) => ({ clipId: `clip-${turns.length}` }),
          expect: {},
        },
        client,
        [{}, {}] as unknown as EvalTurnResult[],
      );

      expect(client.callTool).toHaveBeenCalledWith({
        name: "ppal-read-clip",
        arguments: { clipId: "clip-2" },
      });
    });
  });

  describe("assertion result structure", () => {
    it("includes original assertion in result", async () => {
      const assertion: StateAssertion = {
        type: "state",
        tool: "test-tool",
        args: { foo: "bar" },
        expect: {},
      };

      const result = await assertState(assertion, [], jsonClient({}));

      expect(result.assertion).toBe(assertion);
    });

    it("includes tool name in message", async () => {
      const result = await runState(
        { tool: "custom-tool-name", args: {}, expect: {} },
        jsonClient({}),
      );

      expect(result.message).toContain("custom-tool-name");
    });
  });

  describe("notation override", () => {
    beforeEach(() => {
      vi.mocked(setConfig).mockClear();
      vi.mocked(getNotation).mockReset().mockResolvedValue(DEFAULT_NOTATION);
    });

    const overridingRead: Omit<StateAssertion, "type"> = {
      tool: "ppal-read-clip",
      notation: "midi-json",
      args: { clipId: "1" },
      expect: () => true,
    };

    it("leaves config untouched when no notation override is set", async () => {
      await runState(
        { tool: "read-track", args: {}, expect: {} },
        jsonClient({}),
      );

      expect(setConfig).not.toHaveBeenCalled();
    });

    it("restores the prior notation after a per-assertion override", async () => {
      await runState(overridingRead, jsonClient({ ok: true }));

      // Override applied for the read, then reset so it can't leak downstream.
      expect(setConfig).toHaveBeenNthCalledWith(1, { notation: "midi-json" });
      expect(setConfig).toHaveBeenNthCalledWith(2, {
        notation: DEFAULT_NOTATION,
      });
    });

    it("restores the scenario's notation, not the hardcoded default", async () => {
      // Scenario configured a non-default notation; a mid-scenario assertion
      // that overrides notation must restore that configured value, not barbeat.
      vi.mocked(getNotation).mockResolvedValue("stark");

      await runState(overridingRead, jsonClient({ ok: true }));

      expect(setConfig).toHaveBeenNthCalledWith(1, { notation: "midi-json" });
      expect(setConfig).toHaveBeenNthCalledWith(2, { notation: "stark" });
    });

    it("still restores the notation when the read throws", async () => {
      vi.mocked(getNotation).mockResolvedValue("stark");

      const result = await runState(
        { ...overridingRead, args: {} },
        throwingClient(new Error("boom")),
      );

      expect(result.earned).toBe(0);
      expect(setConfig).toHaveBeenNthCalledWith(2, { notation: "stark" });
    });
  });
});

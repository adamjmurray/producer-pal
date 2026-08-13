// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it, vi } from "vitest";
import { type EvalSession } from "../../eval-session.ts";
import { runMessageTurns } from "../../run-scenario-helpers.ts";
import {
  CONNECT_MESSAGE,
  CONNECT_TOOL,
  SEEDED_CONNECT_REPLY,
  seedConnectTurn,
  shouldSeedConnect,
} from "./seed-connect.ts";
import { buildSeededMessages, type SeededTurn } from "./seeded-turn.ts";
import { type EvalScenario, type EvalTurnResult } from "../../types.ts";

const CONNECT_RESULT = "connected: tempo 120, tracks 4";
/** ppal-connect answers in several blocks; the skills are not the first one. */
const CONNECT_SKILLS = "# Producer Pal Skills\n...";
const CONNECT_CONTENT = [
  { type: "text", text: CONNECT_RESULT },
  { type: "text", text: CONNECT_SKILLS },
];

/**
 * Build a scenario with the given messages and no assertions.
 *
 * @param messages - Conversation messages
 * @param overrides - Extra scenario fields
 * @returns A minimal scenario
 */
function scenario(
  messages: string[],
  overrides: Partial<EvalScenario> = {},
): EvalScenario {
  return {
    id: "test",
    description: "test",
    liveSet: "basic-midi-4-track",
    messages,
    assertions: [],
    ...overrides,
  };
}

interface StubOptions {
  seedable?: boolean;
  connectContent?: Array<{ type: string; text: string }>;
}

type SeedableSession = EvalSession & {
  seedTurn: NonNullable<EvalSession["seedTurn"]>;
};

/**
 * Build a session stub that records what it was asked to do.
 *
 * @param options - Stub configuration
 * @param options.seedable - Whether the session supports `seedTurn` (default: true)
 * @param options.connectContent - Content blocks the connect tool returns
 * @returns The session plus the recorded seeds and sent messages
 */
function sessionStub(options: StubOptions = {}): {
  session: EvalSession;
  seeded: SeededTurn[];
  sent: string[];
} {
  const seeded: SeededTurn[] = [];
  const sent: string[] = [];
  const content = options.connectContent ?? CONNECT_CONTENT;
  const mcpClient = {
    callTool: vi.fn().mockResolvedValue({ content }),
  } as unknown as Client;

  const session: EvalSession = {
    mcpClient,
    sendMessage: async (message: string) => {
      sent.push(message);

      return await Promise.resolve({
        text: `reply to ${message}`,
        toolCalls: [],
      });
    },
    close: async () => await Promise.resolve(),
    ...(options.seedable !== false
      ? {
          seedTurn: (turn: SeededTurn) => {
            seeded.push(turn);
          },
        }
      : {}),
  };

  return { session, seeded, sent };
}

/**
 * Narrow a stub session to one that supports seeding.
 *
 * @param session - The stub session
 * @returns The same session typed with a non-optional `seedTurn`
 */
function asSeedable(session: EvalSession): SeedableSession {
  return session as SeedableSession;
}

/**
 * Seed a connect turn against a fresh stub session.
 *
 * @param options - Stub configuration forwarded to `sessionStub`
 * @returns The stub's recordings plus the seeded turn
 */
async function seedWithStub(options: StubOptions = {}) {
  const stub = sessionStub(options);
  const turn = await seedConnectTurn(asSeedable(stub.session), CONNECT_MESSAGE);

  return { ...stub, turn };
}

/**
 * Run the standard connect-then-prompt scenario through `runMessageTurns`.
 *
 * @param seedConnect - Whether the run has seeding enabled
 * @param options - Stub configuration forwarded to `sessionStub`
 * @returns The stub's recordings plus the collected turns
 */
async function runTwoMessageScenario(
  seedConnect: boolean,
  options: StubOptions = {},
) {
  const stub = sessionStub(options);
  const turns: EvalTurnResult[] = [];

  await runMessageTurns(
    scenario([CONNECT_MESSAGE, "make a clip"]),
    stub.session,
    turns,
    seedConnect,
  );

  return { ...stub, turns };
}

describe("shouldSeedConnect", () => {
  it("seeds a scenario that opens with the connect message", () => {
    expect(
      shouldSeedConnect(scenario([CONNECT_MESSAGE, "make a clip"]), true),
    ).toBe(true);
  });

  it("does not seed when the run disabled seeding", () => {
    expect(
      shouldSeedConnect(scenario([CONNECT_MESSAGE, "make a clip"]), false),
    ).toBe(false);
  });

  it("does not seed a scenario that opted out", () => {
    expect(
      shouldSeedConnect(
        scenario([CONNECT_MESSAGE, "make a clip"], { seedConnect: false }),
        true,
      ),
    ).toBe(false);
  });

  it("does not seed when the first message is not the connect message", () => {
    expect(shouldSeedConnect(scenario(["make a clip"]), true)).toBe(false);
  });

  it("does not seed a scenario whose only message is the connect message", () => {
    expect(shouldSeedConnect(scenario([CONNECT_MESSAGE]), true)).toBe(false);
  });
});

describe("seedConnectTurn", () => {
  it("calls the connect tool and writes the turn into history", async () => {
    const { session, seeded, turn } = await seedWithStub();

    expect(session.mcpClient.callTool).toHaveBeenCalledWith({
      name: CONNECT_TOOL,
      arguments: {},
    });

    expect(seeded).toStrictEqual([
      {
        userMessage: CONNECT_MESSAGE,
        toolName: CONNECT_TOOL,
        toolArgs: {},
        toolOutput: CONNECT_CONTENT,
        assistantText: SEEDED_CONNECT_REPLY,
      },
    ]);

    expect(turn.turnIndex).toBe(0);
    expect(turn.seeded).toBe(true);
    expect(turn.assistantResponse).toBe(SEEDED_CONNECT_REPLY);
    expect(turn.toolCalls).toStrictEqual([
      { name: CONNECT_TOOL, args: {}, result: CONNECT_RESULT },
    ]);
  });

  // The bug this pins: seeding once unwrapped only the FIRST text block, so the
  // 42KB skills payload — block two of four — never reached the model. Every
  // check still passed; the only tell was the input-token count dropping by
  // exactly the size of the skills.
  it("puts every content block into history, not just the first", async () => {
    const { seeded } = await seedWithStub();

    expect(seeded[0]?.toolOutput).toStrictEqual(CONNECT_CONTENT);
  });

  it("records only the first block as the turn's result text", async () => {
    // Matches what the streaming path records for a real call, so assertions
    // and the judge transcript read the same string either way.
    const { turn } = await seedWithStub();

    expect(turn.toolCalls[0]?.result).toBe(CONNECT_RESULT);
  });

  it("carries any relayed WARNING blocks beside the result, as the streaming path does", async () => {
    const { turn } = await seedWithStub({
      connectContent: [
        { type: "text", text: CONNECT_RESULT },
        { type: "text", text: "WARNING: could not read track 3" },
      ],
    });

    expect(turn.toolCalls[0]?.result).toBe(CONNECT_RESULT);
    expect(turn.toolCalls[0]?.warnings).toStrictEqual([
      "WARNING: could not read track 3",
    ]);
  });

  it("omits warnings entirely when the connect call warned about nothing", async () => {
    const { turn } = await seedWithStub();

    expect(turn.toolCalls[0]).not.toHaveProperty("warnings");
  });

  it("reports no token usage — nothing was spent", async () => {
    const { turn } = await seedWithStub();

    expect(turn.stepUsages).toBeUndefined();
  });

  it("throws when the connect tool returns no text", async () => {
    const { session } = sessionStub({ connectContent: [] });

    await expect(
      seedConnectTurn(asSeedable(session), CONNECT_MESSAGE),
    ).rejects.toThrow(/returned no text/);
  });
});

describe("runMessageTurns", () => {
  it("seeds the connect turn and sends the rest to the model", async () => {
    const { seeded, sent, turns } = await runTwoMessageScenario(true);

    expect(seeded).toHaveLength(1);
    expect(sent).toStrictEqual(["make a clip"]);
    expect(turns.map((t) => t.turnIndex)).toStrictEqual([0, 1]);
    expect(turns[0]?.seeded).toBe(true);
    expect(turns[1]?.seeded).toBeUndefined();
  });

  it("sends every turn to the model when seeding is off", async () => {
    const { seeded, sent, turns } = await runTwoMessageScenario(false);

    expect(seeded).toStrictEqual([]);
    expect(sent).toStrictEqual([CONNECT_MESSAGE, "make a clip"]);
    expect(turns[0]?.seeded).toBeUndefined();
  });

  it("falls back to a real turn on a transport that cannot seed", async () => {
    const { sent, turns } = await runTwoMessageScenario(true, {
      seedable: false,
    });

    expect(sent).toStrictEqual([CONNECT_MESSAGE, "make a clip"]);
    expect(turns[0]?.seeded).toBeUndefined();
  });
});

describe("buildSeededMessages", () => {
  const turn: SeededTurn = {
    userMessage: CONNECT_MESSAGE,
    toolName: CONNECT_TOOL,
    toolArgs: {},
    toolOutput: CONNECT_CONTENT,
    assistantText: SEEDED_CONNECT_REPLY,
  };

  it("writes user, tool call, tool result, and assistant text in order", () => {
    expect(buildSeededMessages(turn, "call-1")).toStrictEqual([
      { role: "user", content: CONNECT_MESSAGE },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: CONNECT_TOOL,
            input: {},
            providerOptions: {
              google: { thoughtSignature: "skip_thought_signature_validator" },
            },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: CONNECT_TOOL,
            output: { type: "json", value: CONNECT_CONTENT },
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: SEEDED_CONNECT_REPLY }],
      },
    ]);
  });

  it("ends on an assistant message so the next user message follows one", () => {
    const messages = buildSeededMessages(turn, "call-1");

    expect(messages.at(-1)?.role).toBe("assistant");
  });
});

describe("SEEDED_CONNECT_REPLY", () => {
  // The canned reply lands in every seeded transcript, where an any-turn
  // `response_contains` would happily match it and pass a scenario the model
  // never satisfied. Keep it free of the vocabulary those patterns look for.
  it("does not contain words scenarios match on", () => {
    expect(SEEDED_CONNECT_REPLY).not.toMatch(
      /drum|kick|snare|hi-?hat|clip|note|melody|bass|kit|pad|rack|tempo|quantiz|duplicat|split|legato|octave|transpose|pitch|semitone|scale|random|swing/i,
    );
  });
});

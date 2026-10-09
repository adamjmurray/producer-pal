// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { lookUpMappedMacros } from "#src/tools/shared/device/rack-macro-mappings.ts";
import { MAX_RACKS_PER_CALL } from "#src/tools/shared/remote-script/rack-macros-contract.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

/**
 * Racks that only have a path.
 * @param count - How many
 * @returns The racks
 */
function racks(count: number): LiveAPI[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `live_set tracks 0 devices ${String(i)}`,
  })) as unknown as LiveAPI[];
}

/**
 * The size of each chunk asked.
 * @returns One count per call
 */
function chunkSizes(): number[] {
  return vi
    .mocked(requestNode)
    .mock.calls.map(
      ([, args]) => (args as { devicePaths: string[] }).devicePaths.length,
    );
}

describe("lookUpMappedMacros", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks in chunks at the remote script's cap and keeps the order", async () => {
    vi.mocked(requestNode).mockImplementation(async (_route, args) => ({
      success: true,
      result: {
        available: true,
        result: {
          racks: (args as { devicePaths: string[] }).devicePaths.map(
            (path) => ({
              mapped: [Number(path.split(" ").at(-1)) % 16],
            }),
          ),
        },
      },
    }));

    const answers = await lookUpMappedMacros(
      racks(MAX_RACKS_PER_CALL + 1),
      null,
    );

    expect(chunkSizes()).toStrictEqual([MAX_RACKS_PER_CALL, 1]);
    expect(answers).toHaveLength(MAX_RACKS_PER_CALL + 1);
    expect(answers?.[MAX_RACKS_PER_CALL]).toStrictEqual({
      mapped: [MAX_RACKS_PER_CALL % 16],
    });
  });

  it("stops asking once a chunk gets no answer, and says why for the rest", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: false, error: "x" });

    const answers = await lookUpMappedMacros(
      racks(MAX_RACKS_PER_CALL + 1),
      null,
    );

    expect(chunkSizes()).toStrictEqual([MAX_RACKS_PER_CALL]);
    expect(answers).toHaveLength(MAX_RACKS_PER_CALL + 1);
    expect(answers?.at(-1)).toStrictEqual({
      unreadable: "the Producer Pal remote script did not answer in time",
    });
  });

  it("is null when the remote script isn't there", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    expect(await lookUpMappedMacros(racks(3), null)).toBeNull();
  });

  it("asks nothing about no racks", async () => {
    expect(await lookUpMappedMacros([], null)).toStrictEqual([]);
    expect(requestNode).not.toHaveBeenCalled();
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A CC Control's param, named by the id a device read gave it, is a clip
// envelope target like any other device param.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { registerCcControl } from "#src/tools/device/tests/helpers/cc-control-fixtures.ts";
import { readDevice } from "#src/tools/device/read/read-device.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

describe("updateClip - envelopes on a CC Control", () => {
  beforeEach(() => {
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    registerCcControl();
    vi.mocked(requestNode).mockReset();
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, result: { cleared: true } },
    });
  });

  /**
   * The id a device read gives the CC Control's Mod Wheel.
   * @returns The param id
   */
  async function modWheelId(): Promise<string | undefined> {
    const read = (await readDevice({ id: "cc-1", include: ["params"] })) as {
      parameters: Array<{ id: string; name: string }>;
    };

    return read.parameters.find((param) => param.name === "Mod Wheel")?.id;
  }

  it("writes Mod Wheel, found in a device read, by its index on the device", async () => {
    const id = await modWheelId();

    const result = await updateClip({
      id: "123",
      envelopes: `${id}: 1|1 0 / 2|1 64`,
    });

    const [, args] =
      vi
        .mocked(requestNode)
        .mock.calls.find((call) => call[0] === ENVELOPE_ROUTES.write) ?? [];

    expect(args).toStrictEqual(
      expect.objectContaining({
        track: "t0",
        slot: 0,
        device: "d0",
        parameter: 1,
      }),
    );
    expect(result).toStrictEqual(
      expect.objectContaining({ id: "123", envelopes: 1 }),
    );
  });

  it("notes a line spelled 0..1 on a 0..127 param", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: {
        available: true,
        result: {
          samples: [],
          parameter: { name: "Mod Wheel", min: 0, max: 127, quantized: false },
        },
      },
    });

    const id = await modWheelId();
    const result = await updateClip({
      id: "123",
      envelopes: `${id}: 1|1 0 / 2|1 1`,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: `envelope "${id}": values span 0..1 of the param's 0..127 range`,
      }),
    );
  });
});

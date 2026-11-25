// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A path that is only a slot on a track makes no chain, so it skips the dry
// walk that guards the paths that might, and costs no extra reads. Its
// refusals come from resolving it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { checkInsertionPath } from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { createDevice } from "../../create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  emitWarning: vi.fn(),
  emitWarningOnce: vi.fn(),
}));

vi.mock(
  import("#src/tools/shared/device/helpers/path/insertion-path.ts"),
  async (importOriginal) => {
    const original = await importOriginal();

    return {
      ...original,
      checkInsertionPath: vi.fn(original.checkInsertionPath),
    };
  },
);

describe("createDevice — a path that is only a slot on a track", () => {
  beforeEach(() => {
    clearMockRegistry();
    vi.mocked(checkInsertionPath).mockClear();
    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { devices: children("existing"), has_midi_input: 1 },
      methods: { insert_device: () => ["id", "made"] },
    });
    registerMockObject("existing", { path: livePath.track(0).device(0) });
    registerMockObject("made", { path: livePath.track(0).device(1) });
  });

  it.each(["t0", "t0/d+", "t0/d1"])("does not walk %s dry", async (path) => {
    await createDevice({ device: "Compressor", path });

    expect(checkInsertionPath).not.toHaveBeenCalled();
  });

  it("still refuses an index past the end", async () => {
    await expect(
      createDevice({ device: "Compressor", path: "t0/d5" }),
    ).rejects.toThrow(
      '"t0/d5" is past the end of a container holding 1 device',
    );
    expect(checkInsertionPath).not.toHaveBeenCalled();
  });

  it("walks a path that can make a chain", async () => {
    await createDevice({ device: "Compressor", path: "t0/d0/c0/d+" }).catch(
      () => undefined,
    );

    expect(checkInsertionPath).toHaveBeenCalledOnce();
  });
});

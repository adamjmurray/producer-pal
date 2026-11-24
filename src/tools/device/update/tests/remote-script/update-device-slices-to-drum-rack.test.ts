// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A Simpler's `sliceToDrumRack` action converts through the remote script once
// the rest of the target's update is done. Its entry reads like any action's:
// the action alone when it ran, `ok: false` and why when it didn't.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { remoteScriptSetup } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { SIMPLER_SETTINGS_ROUTES } from "#src/tools/shared/remote-script/simpler-settings/simpler-settings-contract.ts";
import { livePath, registerMockObject } from "../update-device-test-helpers.ts";
import { updateAsync } from "./update-device-async-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const PATH = livePath.track(0).device(0);
const ACTION = "sliceToDrumRack";
const NO_ANSWER = "the Producer Pal remote script did not answer in time";

/**
 * Register a Simpler at t0/d0.
 * @param playbackMode - Live's playback mode; 2 is slicing
 */
function registerSimpler(playbackMode = 2): void {
  registerMockObject("simpler-1", {
    path: PATH,
    type: "SimplerDevice",
    properties: {
      class_display_name: "Simpler",
      multi_sample_mode: 0,
      playback_mode: playbackMode,
      parameters: [],
    },
  });
}

/**
 * Answer the conversion, putting a Drum Rack where the Simpler was when it
 * succeeds, as Live does.
 * @param reply - What `requestNode` resolves with
 * @param reply.success - Whether Node answered
 * @param reply.result - What the route said
 */
function conversionAnswers(reply: {
  success: boolean;
  result?: unknown;
}): void {
  vi.mocked(requestNode).mockImplementation(async () => {
    const result = reply.result as { result?: unknown } | undefined;

    if (reply.success && result?.result != null) {
      registerMockObject("rack-9", {
        path: PATH,
        type: "RackDevice",
        properties: { class_display_name: "Drum Rack" },
      });
    }

    return reply as Awaited<ReturnType<typeof requestNode>>;
  });
}

describe("updateDevice sliceToDrumRack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerSimpler();
  });

  it("converts through the remote script and answers with the rack's id", async () => {
    conversionAnswers({
      success: true,
      result: { available: true, result: { pads: 8 } },
    });

    expect(
      await updateAsync({ id: "simpler-1", actions: [ACTION] }),
    ).toStrictEqual({
      id: "rack-9",
      path: "t0/d0",
      actions: [{ action: ACTION }],
    });

    const [route, args] = vi.mocked(requestNode).mock.calls[0] ?? [];

    expect(route).toBe(SIMPLER_SETTINGS_ROUTES.toDrumRack);
    expect(args).toStrictEqual(
      expect.objectContaining({ devicePath: String(PATH) }),
    );
  });

  it("converts after the call's other actions, whatever the order", async () => {
    conversionAnswers({
      success: true,
      result: { available: true, result: { pads: 8 } },
    });

    expect(
      await updateAsync({ id: "simpler-1", actions: [ACTION, "reverse"] }),
    ).toStrictEqual(
      expect.objectContaining({
        id: "rack-9",
        actions: [{ action: ACTION }, { action: "reverse" }],
      }),
    );
  });

  it("refuses a Simpler that isn't slicing, without asking the remote script", async () => {
    registerSimpler(1);

    await expect(
      updateAsync({ id: "simpler-1", actions: [ACTION] }),
    ).rejects.toThrow(
      `no action landed — "${ACTION}": the Simpler isn't in slicing mode: set playbackMode to slicing`,
    );
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("refuses a lone target without the remote script, saying what it needs", async () => {
    conversionAnswers({ success: true, result: { available: false } });

    await expect(
      updateAsync({ id: "simpler-1", actions: [ACTION] }),
    ).rejects.toThrow(
      `no action landed — "${ACTION}": needs the Producer Pal remote script, which isn't answering; ${remoteScriptSetup(true)}`,
    );
  });

  it("says when the remote script is out of date", async () => {
    const outdated = "the Producer Pal remote script is out of date";

    conversionAnswers({
      success: true,
      result: { available: false, outdated },
    });

    await expect(
      updateAsync({ id: "simpler-1", actions: [ACTION] }),
    ).rejects.toThrow(`no action landed — "${ACTION}": ${outdated}`);
  });

  it("keeps the rest of the update when the remote script refuses", async () => {
    conversionAnswers({
      success: true,
      result: { available: true, error: "Live refused the conversion: no" },
    });

    expect(
      await updateAsync({ id: "simpler-1", name: "Loop", actions: [ACTION] }),
    ).toStrictEqual({
      id: "simpler-1",
      path: "t0/d0",
      actions: [
        {
          action: ACTION,
          ok: false,
          detail: "not converted: Live refused the conversion: no",
        },
      ],
    });
  });

  it("keeps another action that ran when the conversion fails", async () => {
    conversionAnswers({ success: true, result: { available: false } });

    expect(
      await updateAsync({ id: "simpler-1", actions: ["reverse", ACTION] }),
    ).toStrictEqual(
      expect.objectContaining({
        id: "simpler-1",
        actions: [
          { action: "reverse" },
          {
            action: ACTION,
            ok: false,
            detail: `needs the Producer Pal remote script, which isn't answering; ${remoteScriptSetup(true)}`,
          },
        ],
      }),
    );
  });

  it("says the Simpler may have been converted when nothing answers", async () => {
    conversionAnswers({ success: false });

    expect(
      await updateAsync({ id: "simpler-1", actions: [ACTION] }),
    ).toStrictEqual(
      expect.objectContaining({
        detail: expect.stringContaining(
          "already changed: may have been converted to a Drum Rack",
        ),
      }),
    );
  });

  it("says so too when the route throws", async () => {
    vi.mocked(requestNode).mockRejectedValue(new Error("channel closed"));

    expect(
      await updateAsync({ id: "simpler-1", actions: [ACTION] }),
    ).toStrictEqual(
      expect.objectContaining({
        detail: expect.stringContaining(
          `may have converted: ${NO_ANSWER} (channel closed); read the device to check`,
        ),
      }),
    );
  });
});

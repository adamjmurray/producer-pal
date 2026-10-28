// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { vi, type Mock } from "vitest";
import { type RemoteScriptReply } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { VERSION } from "#src/shared/config.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { type OfflineDeps } from "../../offline/offline-deps.ts";
import {
  copied,
  happyDeps,
  requestAnswers,
} from "../../offline/tests/offline-add-producer-pal-test-helpers.ts";
import { type RunningDevice } from "../running-device.ts";
import { updateProducerPal } from "../update-producer-pal.ts";

/** A version older than this build. */
export const OLD = "2.4.0";

/** What a server that doesn't answer is. */
export const DOWN = Symbol("down");

export const SWAPPED: RemoteScriptReply = {
  available: true,
  status: 200,
  body: { track: { path: "t3", name: "3-MIDI" } },
};

type Answer = string | undefined | typeof DOWN;

/** A running device whose spies the tests read. */
export interface FakeDevice extends RunningDevice {
  connect: Mock<() => Promise<void>>;
  version: Mock<() => string | undefined>;
  reset: Mock<() => void>;
  toolsChanged: Mock<() => void>;
}

/**
 * A device whose server answers each connect as given: with a version, with no
 * version (undefined), or not at all (DOWN). The last answer repeats.
 * @param answers - What successive connects find
 * @returns The device
 */
export function fakeDevice(...answers: Answer[]): FakeDevice {
  let call = 0;
  let current: string | undefined;

  return {
    connect: vi.fn(() => {
      const answer = answers[Math.min(call, answers.length - 1)];

      call += 1;

      if (answer === DOWN) {
        return Promise.reject(new Error("down"));
      }

      current = answer;

      return Promise.resolve();
    }),
    version: vi.fn(() => current),
    reset: vi.fn(),
    toolsChanged: vi.fn(),
  };
}

/**
 * Dependencies for an update that goes right all the way: a bundled device, a
 * running remote script, a copy that updates the file, and a swap that lands.
 * @param overrides - What this test changes
 * @returns The dependencies
 */
export function updateDeps(overrides: Partial<OfflineDeps> = {}): OfflineDeps {
  return happyDeps({
    installDevice: vi.fn(() =>
      copied("updated", { bundledVersion: VERSION, previousVersion: OLD }),
    ),
    request: requestAnswers(SWAPPED),
    ...overrides,
  });
}

/**
 * Run update-producer-pal.
 * @param device - The running device
 * @param deps - The dependencies
 * @param userLibrary - The User Library the call gives, if any
 * @returns The response
 */
export async function updateCall(
  device: RunningDevice,
  deps: OfflineDeps = updateDeps(),
  userLibrary?: string,
): Promise<McpResponse> {
  return await updateProducerPal(userLibrary, device, deps);
}

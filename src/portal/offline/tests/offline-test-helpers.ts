// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect, vi, type Mock } from "vitest";
import { type RemoteScriptPing } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { VERSION } from "#src/shared/config.ts";
import { type OfflineDeps } from "../offline-deps.ts";

export const NOT_RUNNING: RemoteScriptPing = {
  running: false,
  liveVersion: null,
  scriptVersion: null,
  scriptBuild: null,
  scriptCommit: null,
  userLibrary: null,
  otherOnPort: null,
};

export const RUNNING: RemoteScriptPing = {
  running: true,
  liveVersion: "12.4.0",
  scriptVersion: VERSION,
  scriptBuild: null,
  scriptCommit: null,
  userLibrary: null,
  otherOnPort: null,
};

/** A device that never answers. */
export function noDevice(): Promise<void> {
  return Promise.reject(new Error("no device"));
}

/**
 * Offline dependencies that touch nothing: no remote script, no bundled device,
 * no User Library. A test overrides what it is about.
 * @param overrides - The dependencies this test sets up
 * @returns The dependencies, each a mock
 */
export function fakeOfflineDeps(
  overrides: Partial<OfflineDeps> = {},
): OfflineDeps {
  return {
    ping: vi.fn(() => Promise.resolve(NOT_RUNNING)),
    request: vi.fn(() => Promise.resolve({ available: false as const })),
    installRemoteScript: vi.fn(() => ({
      ok: false as const,
      detail: "not set up",
    })),
    findUserLibrary: vi.fn(() => Promise.resolve(null)),
    findBundledDevice: vi.fn(() => null),
    installDevice: vi.fn(() => {
      throw new Error("installDevice not set up");
    }),
    installPluginHost: vi.fn(() => []),
    installedRemoteScript: vi.fn(() => {
      throw new Error("installedRemoteScript not set up");
    }),
    deviceFileStatus: vi.fn(() => {
      throw new Error("deviceFileStatus not set up");
    }),
    fileExists: vi.fn(() => false),
    sleep: vi.fn(() => Promise.resolve()),
    now: vi.fn(() => 0),
    ...overrides,
  };
}

/**
 * Assert that nothing looked at this machine. The clock and sleep are left out:
 * the bridge reads the clock for every setup call.
 * @param deps - Dependencies made by `fakeOfflineDeps`
 */
export function expectNothingTouched(deps: OfflineDeps): void {
  const { now: _now, sleep: _sleep, ...touching } = deps;

  for (const dep of Object.values(touching)) {
    expect((dep as Mock).mock.calls).toHaveLength(0);
  }
}

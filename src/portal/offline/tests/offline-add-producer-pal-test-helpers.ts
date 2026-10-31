// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { type RemoteScriptReply } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { RemoteScriptTimeout } from "#src/mcp-server/rpc/remote-script/remote-script-errors.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { type DeviceInstallResult } from "../../setup/device-install.ts";
import { type OfflineDeps } from "../offline-deps.ts";
import { offlineManage } from "../offline-manage.ts";
import { fakeOfflineDeps, RUNNING } from "./offline-test-helpers.ts";

export const LIBRARY = "/lib";
export const DEVICE_PATH =
  "/lib/Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd";

export const LOADED: RemoteScriptReply = {
  available: true,
  status: 200,
  body: { track: { index: 3, name: "3-MIDI" } },
};

/**
 * @param status - The HTTP status
 * @param error - The remote script's error text
 * @returns An answer with that status
 */
export function failure(status: number, error: string): RemoteScriptReply {
  return { available: true, status, body: { error } };
}

/**
 * @param outcome - What the copy did
 * @param extra - Other fields of the result
 * @returns A device install result
 */
export function copied(
  outcome: DeviceInstallResult["outcome"],
  extra: Partial<DeviceInstallResult> = {},
): DeviceInstallResult {
  return {
    outcome,
    path: DEVICE_PATH,
    detail: "detail",
    changed: outcome === "installed" || outcome === "updated",
    createdFolders: [],
    otherCopies: [],
    ...extra,
  };
}

/**
 * Dependencies for a call that goes right all the way: a bundled device, a
 * running remote script that names its User Library, a load that lands on
 * track 3, and a clock that moves only when the code sleeps.
 * @param overrides - What this test changes
 * @returns The dependencies
 */
export function happyDeps(overrides: Partial<OfflineDeps> = {}): OfflineDeps {
  let time = 0;

  return fakeOfflineDeps({
    ping: vi.fn(() => Promise.resolve({ ...RUNNING, userLibrary: LIBRARY })),
    findBundledDevice: vi.fn(() => "/bundle/Producer_Pal.amxd"),
    installDevice: vi.fn(() => copied("installed")),
    request: vi.fn(() => Promise.resolve(LOADED)),
    sleep: vi.fn((ms: number) => {
      time += ms;

      return Promise.resolve();
    }),
    now: vi.fn(() => time),
    ...overrides,
  });
}

/**
 * Answer the first requests with these, then the last one forever.
 * @param replies - Answers, in order; an Error is thrown instead
 * @returns A request mock
 */
export function requestAnswers(
  ...replies: Array<RemoteScriptReply | Error>
): OfflineDeps["request"] {
  let call = 0;

  return vi.fn(() => {
    const reply = replies[Math.min(call, replies.length - 1)];

    call += 1;

    return reply instanceof Error
      ? Promise.reject(reply)
      : Promise.resolve(reply as RemoteScriptReply);
  });
}

/**
 * @param failures - How many connects fail before one works
 * @returns A connect that works after that many failures
 */
export function connectsAfter(failures: number): () => Promise<void> {
  let left = failures;

  return vi.fn(() => {
    if (left > 0) {
      left -= 1;

      return Promise.reject(new Error("not yet"));
    }

    return Promise.resolve();
  });
}

/**
 * Run add-producer-pal.
 * @param deps - The dependencies
 * @param connect - Connect to the device's server
 * @param args - Extra call arguments, e.g. userLibrary
 * @returns The response
 */
export async function addProducerPalCall(
  deps: OfflineDeps,
  connect: () => Promise<void> = connectsAfter(0),
  args: Record<string, unknown> = {},
): Promise<McpResponse> {
  const response = await offlineManage(
    { action: "add-producer-pal", ...args },
    connect,
    deps,
  );

  if (response == null) {
    throw new Error("add-producer-pal gave no response");
  }

  return response;
}

/**
 * @param response - A tool response
 * @returns Its text
 */
export function responseText(response: McpResponse): string {
  return response.content[0]?.text ?? "";
}

export const SENT_TIMEOUT = new RemoteScriptTimeout(
  "Live's browser did not answer within 20s",
  true,
);
export const UNSENT_TIMEOUT = new RemoteScriptTimeout("ran out of time", false);

/**
 * Dependencies on a clock that each request moves by the time it "takes", as
 * well as each sleep.
 * @param takes - How long each request takes, given the time Live may leave it
 *   queued (`expiresInMs`)
 * @param answer - What the request answers, given the call number from 1
 * @param overrides - Other dependencies this test sets up
 * @returns The dependencies, and how much clock time has passed
 */
export function clockedDeps(
  takes: (expiresInMs: number) => number,
  answer: (call: number) => RemoteScriptReply,
  overrides: Partial<OfflineDeps> = {},
): { deps: OfflineDeps; elapsed: () => number } {
  let time = 0;
  let call = 0;
  const deps = happyDeps({
    now: () => time,
    sleep: (ms) => {
      time += ms;

      return Promise.resolve();
    },
    request: vi.fn((request) => {
      call += 1;
      time += takes(request.expiresInMs ?? 0);

      return Promise.resolve(answer(call));
    }),
    ...overrides,
  });

  return { deps, elapsed: () => time };
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveAPI } from "#src/test/mocks/mock-live-api.ts";
import "../live-api-extensions.ts";

// How the extensions module INSTALLS itself onto the global LiveAPI, as opposed
// to what the installed members do (covered by the sibling files). Two contracts
// live here, and both are invisible to a normal single-import test run:
//
//   1. It is inert when LiveAPI is absent. The module is pulled into Node-side
//      bundles and unit tests where the Max V8 global doesn't exist; importing
//      it there must not throw.
//   2. Installing twice is a no-op. The index getters are defined with
//      `Object.defineProperty` and default to configurable: false, so a second
//      unguarded define would throw TypeError — hence the hasOwnProperty guards.

const g = globalThis as Record<string, unknown>;

describe("LiveAPI extensions - installation", () => {
  afterEach(() => {
    // The suite-wide global must survive whatever this file does to it: the
    // shared test setup installed the extensions onto this exact class object.
    g.LiveAPI = LiveAPI;
    vi.resetModules();
  });

  it("installs nothing when LiveAPI is undefined", async () => {
    delete g.LiveAPI;
    vi.resetModules();

    await expect(import("../live-api-extensions.ts")).resolves.toBeDefined();
  });

  it("re-importing does not redefine the index getters", async () => {
    // Guards absent → Object.defineProperty throws on the non-configurable
    // property the first install already created.
    vi.resetModules();

    await expect(import("../live-api-extensions.ts")).resolves.toBeDefined();
  });

  it("keeps the index getters working after a re-import", async () => {
    vi.resetModules();
    await import("../live-api-extensions.ts");

    expect(LiveAPI.from("live_set tracks 3").trackIndex).toBe(3);
  });
});

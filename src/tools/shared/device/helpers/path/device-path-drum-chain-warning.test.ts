// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Input paths resolve either spelling of a drum chain; only the warning
// depends on which one the caller used. See dev/Object-Paths.md.

import { describe, expect, it } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { resolveInsertionPath } from "./device-path-helpers.ts";
import { resolvePathToLiveApi } from "./device-path-to-live-api.ts";

/** A rack with one drum chain, on pad C1 (note 36). */
function registerDrumRack(): void {
  registerMockObject("rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: { chains: children("chain-0"), can_have_drum_pads: 1 },
  });
  registerMockObject("chain-0", {
    path: livePath.track(0).device(0).chain(0),
    type: "DrumChain",
    properties: { in_note: 36, devices: children() },
  });
}

describe("input resolution warns about rack-relative drum chain spelling", () => {
  it("warns when resolving a chain by its rack-relative index", () => {
    registerDrumRack();

    resolvePathToLiveApi("t0/d0/c0");

    expect(capturedWarnings()).toHaveLength(1);
    expect(capturedWarnings()[0]).toContain("t0/d0/pC1/c0");
  });

  it("warns when resolving a device inside the chain", () => {
    registerDrumRack();

    resolvePathToLiveApi("t0/d0/c0/d0");

    expect(capturedWarnings()).toHaveLength(1);
  });

  it("stays quiet for the pad-relative spelling", () => {
    registerDrumRack();

    resolvePathToLiveApi("t0/d0/pC1/c0");

    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("stays quiet for a chain under a non-drum rack", () => {
    registerMockObject("rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: { chains: children("chain-0"), can_have_drum_pads: 0 },
    });
    registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "Chain",
    });

    resolvePathToLiveApi("t0/d0/c0");

    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("warns once for a batch naming the same drum chain twice", () => {
    registerDrumRack();

    resolvePathToLiveApi("t0/d0/c0");
    resolvePathToLiveApi("t0/d0/c0/d0");

    expect(capturedWarnings()).toHaveLength(1);
  });

  it("warns when a create-device insertion path names a drum chain rack-relatively", () => {
    registerDrumRack();

    resolveInsertionPath("t0/d0/c0");

    expect(capturedWarnings()).toHaveLength(1);
    expect(capturedWarnings()[0]).toContain("t0/d0/pC1/c0");
  });

  it("stays quiet inserting into a plain, non-drum rack chain", () => {
    registerMockObject("rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: { chains: children("chain-0"), can_have_drum_pads: 0 },
    });
    registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "Chain",
      properties: { devices: children() },
    });

    resolveInsertionPath("t0/d0/c0");

    expect(capturedWarnings()).toStrictEqual([]);
  });
});

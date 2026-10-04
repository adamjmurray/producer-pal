// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Lowering a rack's macro count hides macros and keeps their mappings. The
// entry names the mapped macros it hid when the remote script can say which.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import {
  pathsAsked,
  remoteScriptSays,
} from "../../../tests/helpers/rack-macros-route-fixtures.ts";
import { updateDevice } from "../../update-device.ts";
import { registerMacroRack } from "../update-device-test-helpers.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const FIRST = String(livePath.track(0).device(0));
const SECOND = String(livePath.track(0).device(1));

describe("updateDevice macroCount that hides mapped macros", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("names the mapped macro it hid and says its mapping is kept", async () => {
    const rack = registerMacroRack("rack", { count: 8, mapped: true });

    remoteScriptSays({ mapped: [7] });

    expect(await updateDevice({ id: "rack", macroCount: 4 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      detail: "macro 7 hidden; its mapping is kept",
    });
    expect(rack.call).toHaveBeenCalledWith("remove_macro");
    expect(pathsAsked()).toStrictEqual([[FIRST]]);
  });

  it("names only the mapped macros the count hid", async () => {
    registerMacroRack("rack", { count: 8, mapped: true });
    // 2 stays visible; 12 was hidden before this call.
    remoteScriptSays({ mapped: [2, 5, 7, 12] });

    expect(await updateDevice({ id: "rack", macroCount: 4 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      detail: "macros 5 and 7 hidden; their mappings are kept",
    });
  });

  it("lists three or more", async () => {
    registerMacroRack("rack", { count: 8, mapped: true });
    remoteScriptSays({ mapped: [5, 6, 8] });

    expect(await updateDevice({ id: "rack", macroCount: 4 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      detail: "macros 5, 6 and 8 hidden; their mappings are kept",
    });
  });

  it("says nothing when the mapped macros all stay visible", async () => {
    registerMacroRack("rack", { count: 8, mapped: true });
    remoteScriptSays({ mapped: [1, 2] });

    expect(await updateDevice({ id: "rack", macroCount: 4 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
    });
  });

  it("asks once for every rack a list lowers", async () => {
    registerMacroRack("one", { count: 8, mapped: true });
    registerMacroRack("two", { count: 8, mapped: true, slot: 1 });
    remoteScriptSays({ mapped: [8] }, { mapped: [6] });

    expect(await updateDevice({ id: "one,two", macroCount: 4 })).toStrictEqual([
      {
        id: "one",
        path: "t0/d0",
        detail: "macro 8 hidden; its mapping is kept",
      },
      {
        id: "two",
        path: "t0/d1",
        detail: "macro 6 hidden; its mapping is kept",
      },
    ]);
    expect(pathsAsked()).toStrictEqual([[FIRST, SECOND]]);
  });

  it("doesn't ask about a rack with no mappings", async () => {
    registerMacroRack("rack", { count: 8 });

    expect(await updateDevice({ id: "rack", macroCount: 4 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
    });
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("doesn't ask for a target that also loads a preset", async () => {
    registerMacroRack("rack", { count: 8, mapped: true });
    vi.mocked(requestNode).mockImplementation(async (route) => ({
      success: true,
      result:
        route === REMOTE_SCRIPT_ROUTES.resolvePreset
          ? {
              available: true,
              item: { type: "instrument", path: "Drift/A.adv", name: "A.adv" },
            }
          : { available: true, replaced: false },
    }));

    await updateDevice({ id: "rack", macroCount: 4, preset: "A" });

    expect(pathsAsked()).toStrictEqual([]);
  });

  it("doesn't ask when the rack is down to 1 macro", async () => {
    registerMacroRack("rack", { count: 1, mapped: true });

    await updateDevice({ id: "rack", macroCount: 0 });

    expect(requestNode).not.toHaveBeenCalled();
  });

  it("doesn't ask when the count goes up", async () => {
    registerMacroRack("rack", { count: 4, mapped: true });

    expect(await updateDevice({ id: "rack", macroCount: 8 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
    });
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("still names the count Live landed on", async () => {
    registerMacroRack("rack", { count: 8, mapped: true, floor: 6 });
    remoteScriptSays({ mapped: [7, 8] });

    expect(await updateDevice({ id: "rack", macroCount: 4 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      detail:
        "macroCount landed at 6, not 4; macros 7 and 8 hidden; their mappings are kept",
    });
  });
});

describe("updateDevice macroCount without which macros are mapped", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  const HIDDEN = {
    id: "rack",
    path: "t0/d0",
  };

  it("says the hidden macros keep any mappings when the remote script isn't running", async () => {
    registerMacroRack("rack", { count: 8, mapped: true });
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    expect(await updateDevice({ id: "rack", macroCount: 4 })).toStrictEqual({
      ...HIDDEN,
      detail: "macros 5 to 8 hidden; any mappings on them are kept",
    });
  });

  it("says why when the remote script refuses", async () => {
    registerMacroRack("rack", { count: 8, mapped: true });
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, error: "unknown route" },
    });

    expect(await updateDevice({ id: "rack", macroCount: 4 })).toStrictEqual({
      ...HIDDEN,
      detail:
        "macros 5 to 8 hidden; any mappings on them are kept. Which are mapped couldn't be checked: unknown route",
    });
  });

  it("says why when it can't read the rack", async () => {
    registerMacroRack("rack", { count: 8, mapped: true });
    remoteScriptSays({ error: "'Rack' is not a rack" });

    expect(await updateDevice({ id: "rack", macroCount: 4 })).toStrictEqual({
      ...HIDDEN,
      detail: expect.stringContaining("'Rack' is not a rack"),
    });
  });

  it("changes the count anyway when the route times out", async () => {
    const rack = registerMacroRack("rack", { count: 8, mapped: true });

    vi.mocked(requestNode).mockResolvedValue({
      success: false,
      error: "node_request timed out",
    });

    expect(await updateDevice({ id: "rack", macroCount: 4 })).toStrictEqual({
      ...HIDDEN,
      detail:
        "macros 5 to 8 hidden; any mappings on them are kept. Which are mapped couldn't be checked: the Producer Pal remote script did not answer in time",
    });
    expect(rack.call).toHaveBeenCalledTimes(2);
  });

  it("changes the count anyway when the route throws", async () => {
    const rack = registerMacroRack("rack", { count: 8, mapped: true });

    vi.mocked(requestNode).mockRejectedValue(new Error("channel closed"));

    expect(await updateDevice({ id: "rack", macroCount: 4 })).toStrictEqual({
      ...HIDDEN,
      detail:
        "macros 5 to 8 hidden; any mappings on them are kept. Which are mapped couldn't be checked: channel closed",
    });
    expect(rack.call).toHaveBeenCalledTimes(2);
  });

  it("says Live stops at 1 macro when asked for none", async () => {
    registerMacroRack("rack", { count: 2, floor: 1 });

    expect(await updateDevice({ id: "rack", macroCount: 0 })).toStrictEqual({
      ...HIDDEN,
      detail: "macroCount landed at 1, not 0; Live keeps at least 1",
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type GenUiEvent } from "#src/shared/gen-ui-types.ts";
import { resetHubForTesting, subscribe } from "../gen-ui-hub.ts";
import * as touched from "../touched-refs.ts";
import { withGenUi } from "../with-gen-ui.ts";
import { listWidgets, resetWidgetStoreForTesting } from "../widget-store.ts";
import { type McpResponse } from "../../../max-api-adapter.ts";

const created: McpResponse = {
  content: [
    { type: "text", text: JSON.stringify({ id: "12", path: "t0/s0" }) },
  ],
};

let events: GenUiEvent[];

beforeEach(() => {
  resetHubForTesting();
  resetWidgetStoreForTesting();
  events = [];
  subscribe((event) => events.push(event));
});

describe("withGenUi", () => {
  it("answers ppal-ui itself and never calls the inner function", async () => {
    const inner = vi.fn();
    const call = withGenUi(inner);

    const result = await call("ppal-ui", {
      action: "create",
      kind: "text",
      text: "hi",
    });

    expect(inner).not.toHaveBeenCalled();
    expect(result.content[0]?.text).toContain('"created"');
    expect(listWidgets()).toHaveLength(1);
  });

  it("tells viewers which objects a finished write touched", async () => {
    const call = withGenUi(vi.fn().mockResolvedValue(created));

    const result = await call("ppal-create-clip", { path: "t0/s0" });

    expect(result).toBe(created);
    expect(events).toStrictEqual([
      {
        type: "live",
        version: 1,
        tool: "ppal-create-clip",
        ids: ["12"],
        paths: ["t0/s0"],
        all: false,
      },
    ]);
  });

  it("stays quiet after a read", async () => {
    const call = withGenUi(vi.fn().mockResolvedValue(created));

    await call("ppal-read-clip", { id: "12" });
    await call("ppal-connect", {});

    expect(events).toStrictEqual([]);
  });

  it("still announces a write that came back as an error", async () => {
    const failed: McpResponse = {
      content: [{ type: "text", text: "boom" }],
      isError: true,
    };
    const call = withGenUi(vi.fn().mockResolvedValue(failed));

    await expect(call("ppal-update-clip", { id: "12" })).resolves.toBe(failed);
    expect(events).toStrictEqual([
      {
        type: "live",
        version: 1,
        tool: "ppal-update-clip",
        ids: ["12"],
        paths: [],
        all: false,
      },
    ]);
  });

  it("announces nothing when the call throws, and rethrows", async () => {
    const call = withGenUi(vi.fn().mockRejectedValue(new Error("gone")));

    await expect(call("ppal-create-clip", {})).rejects.toThrow("gone");
    expect(events).toStrictEqual([]);
  });
});

describe("withGenUi when announcing fails", () => {
  it("returns the result untouched when working out the refs throws", async () => {
    vi.spyOn(touched, "touchedRefs").mockImplementation(() => {
      throw new Error("boom");
    });

    const call = withGenUi(vi.fn().mockResolvedValue(created));
    const before = structuredClone(created);

    await expect(call("ppal-create-clip", {})).resolves.toBe(created);
    expect(created).toStrictEqual(before);
    expect(events).toStrictEqual([]);

    vi.restoreAllMocks();
  });

  it("returns the result untouched when a viewer throws", async () => {
    resetHubForTesting();

    const seen: GenUiEvent[] = [];

    subscribe(() => {
      throw new Error("socket closed");
    });
    subscribe((event) => seen.push(event));

    const call = withGenUi(vi.fn().mockResolvedValue(created));

    await expect(call("ppal-create-clip", {})).resolves.toBe(created);
    // The dead viewer is dropped; the live one still hears it.
    expect(seen).toHaveLength(1);
  });
});

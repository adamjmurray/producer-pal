// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as maxConsole from "#src/shared/max/v8-max-console.ts";
import { library } from "../../library.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const protocolMock =
  await import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts");

// `queries` is the name the fan-out shipped under. A call that used it gets
// every error about the list under that name, not under `searches`.
describe.each(["searches", "queries"])("library %s", (param) => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { items: [], dbAvailable: true },
    });
  });

  it("refuses an empty list", async () => {
    await expect(library({ action: "search", [param]: [] })).rejects.toThrow(
      `${param} must name at least one search`,
    );
  });

  it("names a search with no query or filter", async () => {
    await expect(
      library({ action: "search", [param]: [{ label: "Kicks" }] }),
    ).rejects.toThrow(`${param} "Kicks" has no query or filter`);
  });

  it("names the list that is cut to the cap", async () => {
    const warn = vi.spyOn(maxConsole, "emitWarning");
    const queries = Array.from({ length: 25 }, (_, i) => ({ query: `q${i}` }));

    await library({ action: "search", [param]: queries });

    expect(warn).toHaveBeenCalledWith(
      `${param}: 25 queries exceeds cap of 20; ignoring the extra 5`,
    );
  });

  it("names the list that top-level filters were sent beside", async () => {
    await expect(
      library({ action: "search", [param]: [{ query: "a" }], tags: "x" }),
    ).rejects.toThrow(`tags can't be sent beside ${param}`);
  });
});

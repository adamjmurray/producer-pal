// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { setupRestRoutesServer } from "../express-app-test-helpers.ts";

describe("REST API Routes – callLiveApi error path", () => {
  const routesState = setupRestRoutesServer({
    getConfig: () => ({ tools: ["ppal-connect"], liveApiEnabled: false }),
  });

  it("should return 500 when callLiveApi throws", async () => {
    routesState.callLiveApi.mockRejectedValueOnce(
      new Error("Max connection lost"),
    );

    const response = await fetch(
      `${routesState.baseUrl}/api/tools/ppal-connect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(500);

    const body = await response.json();

    expect(body.error).toBe("Internal server error");
  });
});

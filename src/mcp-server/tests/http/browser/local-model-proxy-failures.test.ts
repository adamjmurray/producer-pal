// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { useProxyFixture } from "./local-model-proxy-test-helpers.ts";

describe("/local-model-proxy when the model server fails", () => {
  const fixture = useProxyFixture();

  it("explains when nothing is listening at an https address", async () => {
    const dead = fixture.modelPort();

    await new Promise((resolve) => fixture.upstream().close(resolve));

    const res = await fixture.proxy(`https://127.0.0.1:${dead}/v1/models`);

    expect(res.status).toBe(502);
    expect(res.headers.get("x-producer-pal-proxy-error")).toBe("true");
    expect(await res.text()).toContain(
      `Couldn't reach the local model server at https://127.0.0.1:${dead}.`,
    );
  });

  it("cuts the answer when the connection resets after it started", async () => {
    fixture.answerWith((res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write("data: one\n\n");
      setTimeout(() => res.socket?.resetAndDestroy(), 10);
    });

    const res = await fixture.proxy(
      `http://127.0.0.1:${fixture.modelPort()}/v1/models`,
    );

    expect(res.status).toBe(200);
    await expect(res.text()).rejects.toThrow("terminated");
  });
});

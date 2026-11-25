// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  APP_SANDBOX,
  buildAppCsp,
  buildAppDocument,
} from "#webui/lib/utils/gen-ui/app-document";

describe("APP_SANDBOX", () => {
  it("grants scripts only, never the host's origin", () => {
    expect(APP_SANDBOX).toBe("allow-scripts");
    expect(APP_SANDBOX).not.toContain("allow-same-origin");
  });
});

describe("buildAppCsp", () => {
  const directives = new Map(
    buildAppCsp()
      .split("; ")
      .map((part) => {
        const [name = "", ...sources] = part.split(" ");

        return [name, sources] as const;
      }),
  );

  it("blocks everything by default and every network connection", () => {
    expect(directives.get("default-src")).toStrictEqual(["'none'"]);
    expect(directives.get("connect-src")).toStrictEqual(["'none'"]);
    expect(directives.get("frame-src")).toStrictEqual(["'none'"]);
    expect(directives.get("form-action")).toStrictEqual(["'none'"]);
    expect(directives.get("base-uri")).toStrictEqual(["'none'"]);
  });

  it("lets a self-contained document run inline script and style", () => {
    expect(directives.get("script-src")).toContain("'unsafe-inline'");
    expect(directives.get("style-src")).toStrictEqual(["'unsafe-inline'"]);
  });

  it("allows no remote source in any directive", () => {
    const sources = [...directives.values()].flat();

    expect(sources.filter((s) => /^(https?:|\*|wss?:)/.test(s))).toStrictEqual(
      [],
    );
  });
});

describe("buildAppDocument", () => {
  it("puts the policy first, then the WebRTC prelude, then the app", () => {
    const doc = buildAppDocument("<p>app</p>");
    const policy = doc.indexOf('<meta http-equiv="Content-Security-Policy"');
    const prelude = doc.indexOf("<script>");
    const app = doc.indexOf("<p>app</p>");

    expect(doc.startsWith("<!doctype html><meta ")).toBe(true);
    expect(policy).toBeGreaterThan(-1);
    expect(prelude).toBeGreaterThan(policy);
    expect(app).toBeGreaterThan(prelude);
    expect(doc.slice(prelude, app)).toContain("RTC");
    expect(doc.endsWith("<p>app</p>")).toBe(true);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  parseFrontmatter,
  serializeFrontmatter,
} from "#src/mcp-server/helpers/markdown-store/frontmatter.ts";

describe("parseFrontmatter", () => {
  it("returns the whole string as body when there is no fence", () => {
    expect(parseFrontmatter("just a body\nno fence")).toStrictEqual({
      data: {},
      body: "just a body\nno fence",
    });
  });

  it("splits a leading fenced block into data and body", () => {
    const raw =
      "---\nproducerPalVersion: 1.5.0\nbuiltInHash: abc123\n---\n\nThe body.";

    expect(parseFrontmatter(raw)).toStrictEqual({
      data: { producerPalVersion: "1.5.0", builtInHash: "abc123" },
      body: "The body.",
    });
  });

  it("keeps a colon in the value (splits on the first colon only)", () => {
    const raw = "---\nnote: a: b: c\n---\nbody";

    expect(parseFrontmatter(raw).data.note).toBe("a: b: c");
  });

  it("treats an unterminated fence as plain body", () => {
    const raw = "---\nproducerPalVersion: 1.5.0\nno closing fence";

    expect(parseFrontmatter(raw)).toStrictEqual({ data: {}, body: raw });
  });

  it("allows blank lines between pairs inside the block", () => {
    const raw = "---\na: 1\n\nb: 2\n---\nbody";

    expect(parseFrontmatter(raw).data).toStrictEqual({ a: "1", b: "2" });
  });

  it("keeps the whole file as body when a block has a non-`key: value` line", () => {
    // A stray prose line inside the fence means it's a thematic break wrapping
    // content, not frontmatter. Parsing the pairs and dropping the prose would
    // silently lose it (and a re-serialize would make that permanent), so the
    // whole document stays in the body.
    const raw = "---\n\nkey: value\nnot a pair\n---\nbody";

    expect(parseFrontmatter(raw)).toStrictEqual({ data: {}, body: raw });
  });

  it("keeps a block with a non-identifier key (e.g. a bare URL) as body", () => {
    // "See https://example.com" splits at the "https:" colon into the key
    // "See https", which has a space — not an identifier, so it's content.
    const raw = "---\n\nSee https://example.com for details\n\n---\n\nbody";

    expect(parseFrontmatter(raw)).toStrictEqual({ data: {}, body: raw });
  });

  it("keeps an all-blank fenced block as body (thematic break)", () => {
    const raw = "---\n\n---\n\nbody";

    expect(parseFrontmatter(raw)).toStrictEqual({ data: {}, body: raw });
  });

  it("keeps content when a leading --- is a thematic break, not frontmatter", () => {
    // A hand-authored file opening with a markdown thematic break: the fenced
    // block has no `key: value` pairs, so it must stay in the body rather than
    // being swallowed into empty metadata.
    const raw = "---\n\n# My Custom Context\n\nSome guidance.\n\n---\n\nMore.";

    expect(parseFrontmatter(raw)).toStrictEqual({ data: {}, body: raw });
  });

  it("parses a CRLF file (Windows line endings) the same as LF", () => {
    // Regression: the close fence "---\r" never matched "---", so the whole
    // file (provenance block included) was returned as body and drift detection
    // silently broke. Splitting on /\r?\n/ handles both.
    const raw =
      "---\r\nproducerPalVersion: 1.5.0\r\nbuiltInHash: abc123\r\n---\r\n\r\nThe body.";

    expect(parseFrontmatter(raw)).toStrictEqual({
      data: { producerPalVersion: "1.5.0", builtInHash: "abc123" },
      body: "The body.",
    });
  });
});

describe("serializeFrontmatter", () => {
  it("returns the body unchanged when there is no data", () => {
    expect(serializeFrontmatter({}, "body only")).toBe("body only");
  });

  it("emits a fenced block above the body", () => {
    expect(serializeFrontmatter({ a: "1", b: "2" }, "body")).toBe(
      "---\na: 1\nb: 2\n---\n\nbody",
    );
  });

  it("round-trips through parseFrontmatter", () => {
    const data = { producerPalVersion: "1.5.0", builtInHash: "deadbeef" };
    const body = "Custom fragment text.\n";

    const parsed = parseFrontmatter(serializeFrontmatter(data, body));

    expect(parsed.data).toStrictEqual(data);
    expect(parsed.body).toBe(body);
  });
});

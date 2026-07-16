// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  parseFrontmatter,
  serializeFrontmatter,
} from "#src/mcp-server/helpers/markdown-store/frontmatter.ts";

// The provenance keys most fixtures here use; a leading `---…---` block is only
// treated as frontmatter when every key is in the caller's known set.
const PROV = ["producerPalVersion", "builtInHash"];

describe("parseFrontmatter", () => {
  it("returns the whole string as body when there is no fence", () => {
    expect(parseFrontmatter("just a body\nno fence", PROV)).toStrictEqual({
      data: {},
      body: "just a body\nno fence",
    });
  });

  it("splits a leading fenced block into data and body", () => {
    const raw =
      "---\nproducerPalVersion: 1.5.0\nbuiltInHash: abc123\n---\n\nThe body.";

    expect(parseFrontmatter(raw, PROV)).toStrictEqual({
      data: { producerPalVersion: "1.5.0", builtInHash: "abc123" },
      body: "The body.",
    });
  });

  it("keeps a colon in the value (splits on the first colon only)", () => {
    const raw = "---\nnote: a: b: c\n---\nbody";

    expect(parseFrontmatter(raw, ["note"]).data.note).toBe("a: b: c");
  });

  it("treats an unterminated fence as plain body", () => {
    const raw = "---\nproducerPalVersion: 1.5.0\nno closing fence";

    expect(parseFrontmatter(raw, PROV)).toStrictEqual({ data: {}, body: raw });
  });

  it("allows blank lines between pairs inside the block", () => {
    const raw = "---\na: 1\n\nb: 2\n---\nbody";

    expect(parseFrontmatter(raw, ["a", "b"]).data).toStrictEqual({
      a: "1",
      b: "2",
    });
  });

  it("keeps the whole file as body when a block has a non-`key: value` line", () => {
    // A stray prose line inside the fence means it's a thematic break wrapping
    // content, not frontmatter. Parsing the pairs and dropping the prose would
    // silently lose it (and a re-serialize would make that permanent), so the
    // whole document stays in the body.
    const raw = "---\n\nkey: value\nnot a pair\n---\nbody";

    expect(parseFrontmatter(raw, ["key"])).toStrictEqual({
      data: {},
      body: raw,
    });
  });

  it("keeps a block with an unrecognized key (e.g. a bare URL) as body", () => {
    // "See https://example.com" splits at the "https:" colon into the key
    // "See https" — not one we write, so the block is content, not frontmatter.
    const raw = "---\n\nSee https://example.com for details\n\n---\n\nbody";

    expect(parseFrontmatter(raw, PROV)).toStrictEqual({ data: {}, body: raw });
  });

  it("keeps a single identifier-shaped content line as body (not frontmatter)", () => {
    // The motivating bug: a lone `Remember: …` note and a bare URL both match
    // the `key: value` shape but aren't keys we write, so a single-line block
    // like this used to be swallowed into metadata and the line dropped on the
    // next read→write. Every key must be recognized or the whole doc is body.
    const note = "---\nRemember: check the mix before exporting\n---\nbody";
    const url = "---\nhttps://example.com/x\n---\nbody";
    const urls = "---\nhttps://a.com/x\nhttps://b.com/y\n---\nbody";

    expect(parseFrontmatter(note, PROV)).toStrictEqual({
      data: {},
      body: note,
    });
    expect(parseFrontmatter(url, PROV)).toStrictEqual({ data: {}, body: url });
    expect(parseFrontmatter(urls, PROV)).toStrictEqual({
      data: {},
      body: urls,
    });
  });

  it("parses a single recognized key (a one-field frontmatter block)", () => {
    // A block is frontmatter as long as its keys are recognized — the guard is
    // key-identity, not pair count, so a lone `description:` still parses.
    const raw = "---\ndescription: analog kicks\n---\n\nIn ~/Samples.";

    expect(parseFrontmatter(raw, ["description"])).toStrictEqual({
      data: { description: "analog kicks" },
      body: "In ~/Samples.",
    });
  });

  it("keeps an all-blank fenced block as body (thematic break)", () => {
    const raw = "---\n\n---\n\nbody";

    expect(parseFrontmatter(raw, PROV)).toStrictEqual({ data: {}, body: raw });
  });

  it("keeps content when a leading --- is a thematic break, not frontmatter", () => {
    // A hand-authored file opening with a markdown thematic break: the fenced
    // block has no recognized `key: value` pairs, so it must stay in the body
    // rather than being swallowed into empty metadata.
    const raw = "---\n\n# My Custom Context\n\nSome guidance.\n\n---\n\nMore.";

    expect(parseFrontmatter(raw, PROV)).toStrictEqual({ data: {}, body: raw });
  });

  it("strips only the leading blank line, preserving interior newlines in the body", () => {
    // The body join re-adds `\n` between lines, then a single leading `\n` is
    // stripped (the blank line after the close fence). The strip must be
    // anchored (`/^\n/`): a body with no blank line after the fence but interior
    // newlines must keep every one of them.
    const raw = "---\ndescription: d\n---\nLine 1\nLine 2\nLine 3";

    expect(parseFrontmatter(raw, ["description"]).body).toBe(
      "Line 1\nLine 2\nLine 3",
    );
  });

  it("parses a CRLF file (Windows line endings) the same as LF", () => {
    // Regression: the close fence "---\r" never matched "---", so the whole
    // file (provenance block included) was returned as body and drift detection
    // silently broke. Splitting on /\r?\n/ handles both.
    const raw =
      "---\r\nproducerPalVersion: 1.5.0\r\nbuiltInHash: abc123\r\n---\r\n\r\nThe body.";

    expect(parseFrontmatter(raw, PROV)).toStrictEqual({
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

    const parsed = parseFrontmatter(serializeFrontmatter(data, body), PROV);

    expect(parsed.data).toStrictEqual(data);
    expect(parsed.body).toBe(body);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  beginWarningCapture,
  endWarningCapture,
} from "#src/shared/max/v8-warning-capture.ts";
import {
  forceGuardMessage,
  textFingerprint,
} from "#src/tools/shared/write-pipeline/force-guard.ts";

const MESSAGE = "would lose it";
const IGNORED = `force:true ignored — nothing had warned about this yet. ${MESSAGE}`;

/**
 * Ask the guard about a target.
 * @param fingerprint - What is at risk now
 * @param force - Whether force:true was sent
 * @returns The guard's answer
 */
function ask(fingerprint: string, force: boolean): string | null {
  return forceGuardMessage("test", "t", fingerprint, force, MESSAGE);
}

describe("forceGuardMessage", () => {
  it("blocks without force and says the message as-is", () => {
    expect(ask("a", false)).toBe(MESSAGE);
  });

  it("ignores force before any warning", () => {
    expect(ask("a", true)).toBe(IGNORED);
  });

  it("lets force through once, in a later request, on the same fingerprint", () => {
    ask("a", false);
    beginWarningCapture();

    expect(ask("a", true)).toBeNull();
    // The record is spent.
    beginWarningCapture();
    expect(ask("a", true)).toBe(IGNORED);
  });

  it("does not let a warning unlock force in its own request", () => {
    ask("a", false);

    expect(ask("a", true)).toBe(IGNORED);
    expect(ask("a", true)).toBe(IGNORED);
  });

  it("does not unlock force with a warning raised in the same request as the force", () => {
    beginWarningCapture();
    expect(ask("a", true)).toBe(IGNORED);
    expect(ask("a", true)).toBe(IGNORED);
    beginWarningCapture();
    expect(ask("a", true)).toBeNull();
  });

  it("ignores force when what is at risk changed, then warns about the new one", () => {
    ask("a", false);
    beginWarningCapture();

    expect(ask("b", true)).toBe(IGNORED);

    beginWarningCapture();
    expect(ask("b", true)).toBeNull();
  });

  it("drops the old fingerprint when it records a new one", () => {
    ask("a", false);
    beginWarningCapture();
    ask("b", false);
    beginWarningCapture();

    expect(ask("a", true)).toBe(IGNORED);
  });

  it("keeps targets and kinds apart", () => {
    forceGuardMessage("test", "one", "a", false, MESSAGE);
    beginWarningCapture();

    expect(forceGuardMessage("test", "two", "a", true, MESSAGE)).toBe(IGNORED);
    expect(forceGuardMessage("other", "one", "a", true, MESSAGE)).toBe(IGNORED);
    beginWarningCapture();
    expect(forceGuardMessage("test", "one", "a", true, MESSAGE)).toBeNull();
  });

  it("treats a call with no request in flight as one request", () => {
    endWarningCapture(beginWarningCapture());
    ask("a", false);

    expect(ask("a", true)).toBe(IGNORED);
  });
});

describe("textFingerprint", () => {
  it("is the same for the same text and differs for different text", () => {
    expect(textFingerprint("- Key: A minor.")).toBe(
      textFingerprint("- Key: A minor."),
    );
    expect(textFingerprint("- Key: A minor.")).not.toBe(
      textFingerprint("- Key: A major."),
    );
    expect(textFingerprint("")).not.toBe(textFingerprint(" "));
  });
});

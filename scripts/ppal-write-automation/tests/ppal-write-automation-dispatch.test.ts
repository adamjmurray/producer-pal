// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import { runCli } from "../ppal-write-automation.ts";

/**
 * Run a callback while capturing everything written to process.stderr and
 * process.stdout, returning the combined stderr text.
 * @param fn - Code to run; its stderr/stdout writes are suppressed + captured
 * @returns Concatenated stderr output as a string
 */
function captureStderr(fn: () => void): string {
  const errSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  const outSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);

  try {
    fn();

    return errSpy.mock.calls.map((c) => String(c[0])).join("");
  } finally {
    errSpy.mockRestore();
    outSpy.mockRestore();
  }
}

/**
 * Invoke runCli with the given argv and return both the exit code and the
 * captured stderr, so each routing assertion can check effect + exit code.
 * @param argv - Argument array passed to runCli
 * @returns Exit code and captured stderr
 */
function invoke(argv: string[]): { code: number; err: string } {
  let code = -999;
  const err = captureStderr(() => {
    code = runCli(argv);
  });

  return { code, err };
}

describe("ppal-write-automation dispatch table", () => {
  describe("known subcommands route to the correct handler", () => {
    it('routes "routing" (no args) to runRouting via its rest-based guard', () => {
      // runRouting is the ONLY handler that emits "routing get|set"; reaching
      // it proves DISPATCH["routing"] forwarded `rest` to runRouting.
      const { code, err } = invoke(["routing"]);

      expect(code).toBe(1);
      expect(err).toContain("FEHLER: routing get|set");
    });

    it('routes "routing" + parseFlags so runRouting hits the required-flags guard', () => {
      // "set" passes the rest[0] guard; the required-flags guard (--als,
      // --track) only fires if rest+parseFlags actually reached runRouting.
      const { code, err } = invoke(["routing", "set"]);

      expect(code).toBe(1);
      expect(err).toContain("FEHLER: --als, --track erforderlich");
    });

    it('routes "list" (a flags-based handler) to runList', () => {
      const { code, err } = invoke(["list"]);

      expect(code).toBe(1);
      expect(err).toContain("FEHLER: --als und --track sind erforderlich");
    });

    it('routes "groove" (a rest-only handler) to runGroove', () => {
      const { code, err } = invoke(["groove"]);

      expect(code).toBe(1);
      expect(err).toContain("FEHLER: groove list|assign|tune|import");
    });
  });

  describe("error path (handler == null branch)", () => {
    it("unknown subcommand -> stderr + return 1", () => {
      const { code, err } = invoke(["frobnicate"]);

      expect(code).toBe(1);
      expect(err).toContain('Unbekanntes Subcommand "frobnicate"');
    });

    it("empty argv (subcommand undefined) -> return 1, no crash", () => {
      const { code, err } = invoke([]);

      expect(code).toBe(1);
      expect(err).toContain('Unbekanntes Subcommand "undefined"');
    });
  });

  describe("catch block stays intact", () => {
    it("a throwing handler is caught and mapped to exit 1", () => {
      // "write" with a non-existent .als makes readAls throw; the runCli
      // try/catch must convert that into "FEHLER: <msg>" + exit 1.
      const { code, err } = invoke([
        "write",
        "--als",
        "/nonexistent/definitely-not-here.als",
        "--track",
        "T",
        "--clip",
        "C",
        "--param",
        "P",
        "--breakpoints",
        "0=0",
      ]);

      expect(code).toBe(1);
      expect(err).toContain("FEHLER:");
    });
  });
});

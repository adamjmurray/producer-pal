// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import {
  emitWarning,
  emitWarningOnce,
  maxError,
  maxLog,
} from "#src/shared/max/v8-max-console.ts";
import {
  beginWarningCapture,
  capturedWarnings,
  resetWarningCapture,
} from "#src/shared/max/v8-warning-capture.ts";

const g = globalThis as Record<string, unknown>;

describe("v8-max-console", () => {
  let consoleLogSpy: MockInstance;
  let consoleErrorSpy: MockInstance;
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    // Clean up any global mocks for Max environment
    delete g.post;
    delete g.error;
    delete g.outlet;
  });

  describe("Max environment simulation", () => {
    it("uses post() function when available", () => {
      const mockPost = vi.fn();

      g.post = mockPost;

      maxLog("test message");
      expect(mockPost).toHaveBeenCalledWith("test message", "\n");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("uses globalThis.error() function when available", () => {
      const mockError = vi.fn();

      g.error = mockError;

      maxError("error message");
      expect(mockError).toHaveBeenCalledWith("error message", "\n");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("maxLog", () => {
    it("logs strings", () => {
      maxLog("test message");
      expect(consoleLogSpy).toHaveBeenCalledWith("test message");
    });

    it("logs numbers", () => {
      maxLog(42);
      expect(consoleLogSpy).toHaveBeenCalledWith("42");
    });

    it("logs booleans", () => {
      maxLog(true);
      expect(consoleLogSpy).toHaveBeenCalledWith("true");
    });

    it("logs arrays", () => {
      maxLog([1, 2, 3]);
      expect(consoleLogSpy).toHaveBeenCalledWith("[1, 2, 3]");
    });

    it("logs objects", () => {
      maxLog({ foo: "bar", count: 42 });
      expect(consoleLogSpy).toHaveBeenCalledWith("{foo: bar, count: 42}");
    });

    it("logs nested objects", () => {
      maxLog({ a: { b: "c" } });
      expect(consoleLogSpy).toHaveBeenCalledWith("{a: {b: c}}");
    });

    it("logs arrays within objects", () => {
      maxLog({ items: [1, 2, 3] });
      expect(consoleLogSpy).toHaveBeenCalledWith("{items: [1, 2, 3]}");
    });

    it("logs Sets", () => {
      maxLog(new Set([1, 2, 3]));
      expect(consoleLogSpy).toHaveBeenCalledWith("Set(1, 2, 3)");
    });

    it("logs Maps", () => {
      const map = new Map();

      map.set("key1", "value1");
      map.set("key2", "value2");
      maxLog(map);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Map(key1 → value1, key2 → value2)",
      );
    });

    it("logs multiple arguments", () => {
      maxLog("test", 42, true);
      expect(consoleLogSpy).toHaveBeenCalledWith("test", "42", "true");
    });

    it("logs custom class instances with JSON serialization", () => {
      class CustomClass {
        prop = "value";
      }
      const instance = new CustomClass();

      maxLog(instance);
      expect(consoleLogSpy).toHaveBeenCalledWith('CustomClass{"prop":"value"}');
    });

    it("falls back to 'Object' when constructor name is unavailable", () => {
      // Object.create(null) would throw on String(), so we need toPrimitive
      // to make String(obj) return "[object Object]" (triggering the fallback)
      const proto = { [Symbol.toPrimitive]: () => "[object Object]" };

      Object.defineProperty(proto, "constructor", { value: undefined });
      const obj = Object.create(proto) as Record<string, unknown>;

      obj.x = 1;
      maxLog(obj);
      // String(obj) → "[object Object]" via toPrimitive, triggers fallback branch
      // constructor is undefined → ?? "Object"
      expect(consoleLogSpy).toHaveBeenCalledWith('Object{"x":1}');
    });

    it("logs Max Dict objects when Dict global is defined", () => {
      // Create a mock Dict class to simulate Max's Dict
      class Dict {
        name = "testDict";
        stringify() {
          return '{\n"key": "value"\n}';
        }
      }

      g.Dict = Dict;
      const dictInstance = new Dict();

      maxLog(dictInstance);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Dict("testDict") { "key": "value" }',
      );

      delete g.Dict;
    });

    it("logs null and undefined as themselves", () => {
      // In Max, Dict is defined, so the switch's Dict case isn't `case null`
      // and a null prototype falls through to String() as it should.
      class Dict {
        name = "unused";
      }

      g.Dict = Dict;

      maxLog(null, undefined);
      expect(consoleLogSpy).toHaveBeenCalledWith("null", "undefined");

      delete g.Dict;
    });

    it("tolerates a Dict without a stringify method (optional chaining)", () => {
      // `stringify?.()` must short-circuit to undefined instead of throwing when
      // a Dict-shaped object has no stringify method.
      class Dict {
        name = "emptyDict";
      }

      g.Dict = Dict;

      maxLog(new Dict());
      expect(consoleLogSpy).toHaveBeenCalledWith('Dict("emptyDict") undefined');

      delete g.Dict;
    });
  });

  describe("maxError", () => {
    it("logs error strings", () => {
      maxError("error message");
      expect(consoleErrorSpy).toHaveBeenCalledWith("error message");
    });

    it("logs error numbers", () => {
      maxError(404);
      expect(consoleErrorSpy).toHaveBeenCalledWith("404");
    });

    it("logs error objects", () => {
      maxError({ code: "ERR_001", message: "Something went wrong" });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "{code: ERR_001, message: Something went wrong}",
      );
    });

    it("logs error arrays", () => {
      maxError(["error1", "error2"]);
      expect(consoleErrorSpy).toHaveBeenCalledWith("[error1, error2]");
    });

    it("logs multiple error arguments", () => {
      maxError("Error:", 500, { status: "failed" });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error:",
        "500",
        "{status: failed}",
      );
    });
  });

  describe("emitWarning", () => {
    it("logs warning strings", () => {
      emitWarning("warning message");
      expect(consoleWarnSpy).toHaveBeenCalledWith("warning message");
    });

    it("logs warning numbers", () => {
      emitWarning(404);
      expect(consoleWarnSpy).toHaveBeenCalledWith("404");
    });

    it("logs warning objects", () => {
      emitWarning({ code: "WARN_001", message: "Something needs attention" });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "{code: WARN_001, message: Something needs attention}",
      );
    });

    it("logs warning arrays", () => {
      emitWarning(["warning1", "warning2"]);
      expect(consoleWarnSpy).toHaveBeenCalledWith("[warning1, warning2]");
    });

    it("logs multiple warning arguments", () => {
      emitWarning("Warning:", 500, { status: "pending" });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Warning:",
        "500",
        "{status: pending}",
      );
    });

    it("stays off the host console in a Max environment", () => {
      const mockOutlet = vi.fn();

      g.outlet = mockOutlet;

      emitWarning("test warning");
      // Under Max the warning rides the response, and nothing goes out an
      // outlet of its own.
      expect(mockOutlet).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("joins multiple arguments with spaces", () => {
      emitWarning("first", 42, "third");
      // Multiple args are join(" ")-ed into one message, not concatenated.
      expect(capturedWarnings()).toContain("first 42 third");
    });
  });

  describe("emitWarningOnce", () => {
    it("warns on the first call for a key", () => {
      emitWarningOnce("k", "first warning");

      expect(capturedWarnings()).toStrictEqual(["first warning"]);
    });

    it("skips a later call for the same key", () => {
      emitWarningOnce("k", "first warning");
      emitWarningOnce("k", "second warning");

      expect(capturedWarnings()).toStrictEqual(["first warning"]);
    });

    it("warns separately for a different key", () => {
      emitWarningOnce("k1", "first warning");
      emitWarningOnce("k2", "second warning");

      expect(capturedWarnings()).toStrictEqual([
        "first warning",
        "second warning",
      ]);
    });
  });

  // With a request in flight the warning goes in its capture and rides its own
  // response. With none there is no response to ride, so it has to be reported
  // as an error instead of waiting around for someone else's.
  describe("with no request in flight", () => {
    it("reports the warning to the Max console", () => {
      const mockError = vi.fn();

      g.error = mockError;
      g.outlet = vi.fn();
      resetWarningCapture();

      emitWarning("nobody asked for this");

      expect(mockError).toHaveBeenCalledWith("nobody asked for this", "\n");
    });

    it("stays off the Max console while a request can take it", () => {
      const mockError = vi.fn();

      g.error = mockError;
      g.outlet = vi.fn();
      beginWarningCapture();

      emitWarning("belongs to a response");

      expect(mockError).not.toHaveBeenCalled();
    });
  });
});

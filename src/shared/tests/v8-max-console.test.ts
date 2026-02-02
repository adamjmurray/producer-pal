import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { error, log, warn } from "#src/shared/v8-max-console.ts";

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

      log("test message");
      expect(mockPost).toHaveBeenCalledWith("test message", "\n");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("uses globalThis.error() function when available", () => {
      const mockError = vi.fn();

      g.error = mockError;

      error("error message");
      expect(mockError).toHaveBeenCalledWith("error message", "\n");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("log", () => {
    it("logs strings", () => {
      log("test message");
      expect(consoleLogSpy).toHaveBeenCalledWith("test message");
    });

    it("logs numbers", () => {
      log(42);
      expect(consoleLogSpy).toHaveBeenCalledWith("42");
    });

    it("logs booleans", () => {
      log(true);
      expect(consoleLogSpy).toHaveBeenCalledWith("true");
    });

    it("logs arrays", () => {
      log([1, 2, 3]);
      expect(consoleLogSpy).toHaveBeenCalledWith("[1, 2, 3]");
    });

    it("logs objects", () => {
      log({ foo: "bar", count: 42 });
      expect(consoleLogSpy).toHaveBeenCalledWith("{foo: bar, count: 42}");
    });

    it("logs nested objects", () => {
      log({ a: { b: "c" } });
      expect(consoleLogSpy).toHaveBeenCalledWith("{a: {b: c}}");
    });

    it("logs arrays within objects", () => {
      log({ items: [1, 2, 3] });
      expect(consoleLogSpy).toHaveBeenCalledWith("{items: [1, 2, 3]}");
    });

    it("logs Sets", () => {
      log(new Set([1, 2, 3]));
      expect(consoleLogSpy).toHaveBeenCalledWith("Set(1, 2, 3)");
    });

    it("logs Maps", () => {
      const map = new Map();

      map.set("key1", "value1");
      map.set("key2", "value2");
      log(map);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Map(key1 → value1, key2 → value2)",
      );
    });

    it("logs multiple arguments", () => {
      log("test", 42, true);
      expect(consoleLogSpy).toHaveBeenCalledWith("test", "42", "true");
    });

    it("logs custom class instances with JSON serialization", () => {
      class CustomClass {
        prop = "value";
      }
      const instance = new CustomClass();

      log(instance);
      expect(consoleLogSpy).toHaveBeenCalledWith('CustomClass{"prop":"value"}');
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

      log(dictInstance);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Dict("testDict") { "key": "value" }',
      );

      delete g.Dict;
    });
  });

  describe("error", () => {
    it("logs error strings", () => {
      error("error message");
      expect(consoleErrorSpy).toHaveBeenCalledWith("error message");
    });

    it("logs error numbers", () => {
      error(404);
      expect(consoleErrorSpy).toHaveBeenCalledWith("404");
    });

    it("logs error objects", () => {
      error({ code: "ERR_001", message: "Something went wrong" });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "{code: ERR_001, message: Something went wrong}",
      );
    });

    it("logs error arrays", () => {
      error(["error1", "error2"]);
      expect(consoleErrorSpy).toHaveBeenCalledWith("[error1, error2]");
    });

    it("logs multiple error arguments", () => {
      error("Error:", 500, { status: "failed" });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error:",
        "500",
        "{status: failed}",
      );
    });
  });

  describe("warn", () => {
    it("logs warning strings", () => {
      warn("warning message");
      expect(consoleWarnSpy).toHaveBeenCalledWith("warning message");
    });

    it("logs warning numbers", () => {
      warn(404);
      expect(consoleWarnSpy).toHaveBeenCalledWith("404");
    });

    it("logs warning objects", () => {
      warn({ code: "WARN_001", message: "Something needs attention" });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "{code: WARN_001, message: Something needs attention}",
      );
    });

    it("logs warning arrays", () => {
      warn(["warning1", "warning2"]);
      expect(consoleWarnSpy).toHaveBeenCalledWith("[warning1, warning2]");
    });

    it("logs multiple warning arguments", () => {
      warn("Warning:", 500, { status: "pending" });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Warning:",
        "500",
        "{status: pending}",
      );
    });

    it("uses outlet() when in Max environment", () => {
      const mockOutlet = vi.fn();

      g.outlet = mockOutlet;

      warn("test warning");
      expect(mockOutlet).toHaveBeenCalledWith(1, "test warning");
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});

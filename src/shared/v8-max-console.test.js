import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { error, log, warn } from "./v8-max-console.js";

describe("v8-max-console", () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
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
        constructor() {
          this.prop = "value";
        }
      }
      const instance = new CustomClass();

      log(instance);
      expect(consoleLogSpy).toHaveBeenCalledWith('CustomClass{"prop":"value"}');
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
    it("logs error strings", () => {
      warn("error message");
      expect(consoleErrorSpy).toHaveBeenCalledWith("error message");
    });

    it("logs error numbers", () => {
      warn(404);
      expect(consoleErrorSpy).toHaveBeenCalledWith("404");
    });

    it("logs error objects", () => {
      warn({ code: "ERR_001", message: "Something went wrong" });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "{code: ERR_001, message: Something went wrong}",
      );
    });

    it("logs error arrays", () => {
      warn(["error1", "error2"]);
      expect(consoleErrorSpy).toHaveBeenCalledWith("[error1, error2]");
    });

    it("logs multiple error arguments", () => {
      warn("Error:", 500, { status: "failed" });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error:",
        "500",
        "{status: failed}",
      );
    });
  });
});

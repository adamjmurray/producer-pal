import { describe, expect, it } from "vitest";
import { truncateString } from "./truncate-string";

describe("truncateString", () => {
  it("returns the original string if it is shorter than maxLength", () => {
    expect(truncateString("hello", 10)).toBe("hello");
    expect(truncateString("test", 4)).toBe("test");
  });

  it("returns the original string if it equals maxLength", () => {
    expect(truncateString("hello", 5)).toBe("hello");
  });

  it("truncates string longer than maxLength", () => {
    expect(truncateString("hello world", 10)).toBe("hello wor…");
    expect(truncateString("this is a long string", 15)).toBe("this is a long…");
  });

  it("uses custom suffix when provided", () => {
    expect(truncateString("hello world", 10, "...")).toBe("hello w...");
    expect(truncateString("test string", 8, " [+]")).toBe("test [+]");
  });

  it("handles null input", () => {
    expect(truncateString(null, 10)).toBe(null);
  });

  it("handles undefined input", () => {
    expect(truncateString(undefined, 10)).toBe(undefined);
  });

  it("handles empty string", () => {
    expect(truncateString("", 10)).toBe("");
  });

  it("handles maxLength of 0", () => {
    expect(truncateString("hello", 0)).toBe("…");
  });

  it("handles maxLength equal to suffix length", () => {
    expect(truncateString("hello", 1)).toBe("…");
  });

  it("handles very long strings", () => {
    const longString = "a".repeat(10000);
    const result = truncateString(longString, 100);

    expect(result).toBeDefined();
    expect(result!.length).toBe(100);
    expect(result!.endsWith("…")).toBe(true);
  });
});

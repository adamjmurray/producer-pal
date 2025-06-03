import { describe, expect, it, vi } from "vitest";

describe("toHaveBeenCalledWithThis", () => {
  it("does stuff", () => {
    const mock = {
      id: "the-mock-id",
      fn: vi.fn(),
    };
    mock.fn("a", 1, { value: false });
    expect(mock.fn).toHaveBeenCalledWithThis(expect.objectContaining({ id: "the-mock-id" }), "a", 1, { value: false });
  });
});

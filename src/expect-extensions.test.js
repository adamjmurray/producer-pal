import { describe, expect, it, vi } from "vitest";

describe("toHaveBeenCalledWithThis", () => {
  it("passes when mock was called with exact context and arguments", () => {
    const mock = {
      id: "the-mock-id",
      fn: vi.fn(),
    };
    mock.fn("a", 1, { value: false });
    expect(mock.fn).toHaveBeenCalledWithThis(expect.objectContaining({ id: "the-mock-id" }), "a", 1, { value: false });
  });

  it("passes when mock was called multiple times and one call matches", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };
    mock.fn("first", "call");
    mock.fn("second", "call"); 
    mock.fn("third", "call");
    
    expect(mock.fn).toHaveBeenCalledWithThis(expect.objectContaining({ id: "test-id" }), "second", "call");
  });

  it("passes with no arguments when mock was called with no arguments", () => {
    const mock = {
      value: 42,
      fn: vi.fn(),
    };
    mock.fn();
    expect(mock.fn).toHaveBeenCalledWithThis(expect.objectContaining({ value: 42 }));
  });

  it("fails when called on non-mock function", () => {
    const regularFunction = () => {};
    expect(() => {
      expect(regularFunction).toHaveBeenCalledWithThis({}, "arg");
    }).toThrow("Expected a mock function");
  });

  it("fails when called on non-function", () => {
    expect(() => {
      expect("not a function").toHaveBeenCalledWithThis({}, "arg");
    }).toThrow("Expected a mock function");
  });

  it("fails when mock was never called", () => {
    const mock = {
      id: "test",
      fn: vi.fn(),
    };
    expect(() => {
      expect(mock.fn).toHaveBeenCalledWithThis(expect.objectContaining({ id: "test" }), "arg");
    }).toThrow("Expected mock function to have been called");
  });

  it("fails when context doesn't match", () => {
    const mock = {
      id: "correct-id",
      fn: vi.fn(),
    };
    mock.fn("arg1", "arg2");
    
    expect(() => {
      expect(mock.fn).toHaveBeenCalledWithThis(expect.objectContaining({ id: "wrong-id" }), "arg1", "arg2");
    }).toThrow("Expected mock function to have been called with");
  });

  it("fails when arguments don't match", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };
    mock.fn("correct", "args");
    
    expect(() => {
      expect(mock.fn).toHaveBeenCalledWithThis(expect.objectContaining({ id: "test-id" }), "wrong", "args");
    }).toThrow("Expected mock function to have been called with");
  });

  it("fails when argument count doesn't match", () => {
    const mock = {
      id: "test-id", 
      fn: vi.fn(),
    };
    mock.fn("only", "two");
    
    expect(() => {
      expect(mock.fn).toHaveBeenCalledWithThis(expect.objectContaining({ id: "test-id" }), "only", "two", "extra");
    }).toThrow("Expected mock function to have been called with");
  });

  it("provides detailed error message showing all calls", () => {
    const mock = {
      id: "test-id",
      name: "test-name", 
      fn: vi.fn(),
    };
    mock.fn("first", 1);
    mock.fn("second", 2);
    
    try {
      expect(mock.fn).toHaveBeenCalledWithThis(expect.objectContaining({ id: "wrong-id" }), "first", 1);
    } catch (error) {
      expect(error.message).toContain("Expected mock function to have been called with:");
      expect(error.message).toContain("Context:");
      expect(error.message).toContain("Args:");
      expect(error.message).toContain("But it was called with:");
      expect(error.message).toContain("Call 1:");
      expect(error.message).toContain("Call 2:");
      expect(error.message).toContain('"first"');
      expect(error.message).toContain('"second"');
    }
  });

  it("works with complex nested objects", () => {
    const mock = {
      config: { 
        nested: { 
          value: "deep" 
        },
        array: [1, 2, 3]
      },
      fn: vi.fn(),
    };
    mock.fn({ complex: "object" }, ["array", "arg"]);
    
    expect(mock.fn).toHaveBeenCalledWithThis(
      expect.objectContaining({ 
        config: expect.objectContaining({
          nested: expect.objectContaining({ value: "deep" })
        })
      }),
      { complex: "object" },
      ["array", "arg"]
    );
  });
});

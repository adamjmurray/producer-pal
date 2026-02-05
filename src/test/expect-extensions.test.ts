// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";

describe("toHaveBeenCalledWithThis", () => {
  it("passes when mock was called with exact context and arguments", () => {
    const mock = {
      id: "the-mock-id",
      fn: vi.fn(),
    };

    mock.fn("a", 1, { value: false });
    expect(mock.fn).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "the-mock-id" }),
      "a",
      1,
      { value: false },
    );
  });

  it("passes when mock was called multiple times and one call matches", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("first", "call");
    mock.fn("second", "call");
    mock.fn("third", "call");

    expect(mock.fn).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "test-id" }),
      "second",
      "call",
    );
  });

  it("passes with no arguments when mock was called with no arguments", () => {
    const mock = {
      value: 42,
      fn: vi.fn(),
    };

    mock.fn();
    expect(mock.fn).toHaveBeenCalledWithThis(
      expect.objectContaining({ value: 42 }),
    );
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
      expect(mock.fn).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "test" }),
        "arg",
      );
    }).toThrow("Expected mock function to have been called");
  });

  it("fails when context doesn't match", () => {
    const mock = {
      id: "correct-id",
      fn: vi.fn(),
    };

    mock.fn("arg1", "arg2");

    expect(() => {
      expect(mock.fn).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "wrong-id" }),
        "arg1",
        "arg2",
      );
    }).toThrow("Expected mock function to have been called with");
  });

  it("fails when arguments don't match", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("correct", "args");

    expect(() => {
      expect(mock.fn).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "test-id" }),
        "wrong",
        "args",
      );
    }).toThrow("Expected mock function to have been called with");
  });

  it("fails when argument count doesn't match", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("only", "two");

    expect(() => {
      expect(mock.fn).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "test-id" }),
        "only",
        "two",
        "extra",
      );
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

    let caughtError: Error | undefined;

    try {
      expect(mock.fn).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "wrong-id" }),
        "first",
        1,
      );
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toContain(
      "Expected mock function to have been called with:",
    );
    expect(caughtError!.message).toContain("Context:");
    expect(caughtError!.message).toContain("Args:");
    expect(caughtError!.message).toContain("But it was called with:");
    expect(caughtError!.message).toContain("Call 1:");
    expect(caughtError!.message).toContain("Call 2:");
    expect(caughtError!.message).toContain('"first"');
    expect(caughtError!.message).toContain('"second"');
  });

  it("works with complex nested objects", () => {
    const mock = {
      config: {
        nested: {
          value: "deep",
        },
        array: [1, 2, 3],
      },
      fn: vi.fn(),
    };

    mock.fn({ complex: "object" }, ["array", "arg"]);

    expect(mock.fn).toHaveBeenCalledWithThis(
      expect.objectContaining({
        config: expect.objectContaining({
          nested: expect.objectContaining({ value: "deep" }),
        }),
      }),
      { complex: "object" },
      ["array", "arg"],
    );
  });

  it("negation (.not) fails when mock was called with expected context and args", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("expected", "args");

    expect(() => {
      expect(mock.fn).not.toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "test-id" }),
        "expected",
        "args",
      );
    }).toThrow(
      "Expected mock function not to have been called with this context and args",
    );
  });
});

describe("toHaveBeenNthCalledWithThis", () => {
  it("passes when nth call matches context and arguments", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("first", "call");
    mock.fn("second", "call");
    mock.fn("third", "call");

    expect(mock.fn).toHaveBeenNthCalledWithThis(
      2,
      expect.objectContaining({ id: "test-id" }),
      "second",
      "call",
    );
  });

  it("passes when checking first call", () => {
    const mock = {
      value: 42,
      fn: vi.fn(),
    };

    mock.fn("only", "call");

    expect(mock.fn).toHaveBeenNthCalledWithThis(
      1,
      expect.objectContaining({ value: 42 }),
      "only",
      "call",
    );
  });

  it("passes when checking last call", () => {
    const mock = {
      name: "test",
      fn: vi.fn(),
    };

    mock.fn("first");
    mock.fn("second");
    mock.fn("last", "call");

    expect(mock.fn).toHaveBeenNthCalledWithThis(
      3,
      expect.objectContaining({ name: "test" }),
      "last",
      "call",
    );
  });

  it("fails when called on non-mock function", () => {
    const regularFunction = () => {};

    expect(() => {
      expect(regularFunction).toHaveBeenNthCalledWithThis(1, {}, "arg");
    }).toThrow("Expected a mock function");
  });

  it("fails when nthCall is not a positive number", () => {
    const mock = {
      id: "test",
      fn: vi.fn(),
    };

    mock.fn("call");

    expect(() => {
      expect(mock.fn).toHaveBeenNthCalledWithThis(
        0,
        expect.objectContaining({ id: "test" }),
        "call",
      );
    }).toThrow("Expected nthCall to be a positive number (1-indexed)");

    expect(() => {
      expect(mock.fn).toHaveBeenNthCalledWithThis(
        -1,
        expect.objectContaining({ id: "test" }),
        "call",
      );
    }).toThrow("Expected nthCall to be a positive number (1-indexed)");
  });

  it("fails when mock wasn't called enough times", () => {
    const mock = {
      id: "test",
      fn: vi.fn(),
    };

    mock.fn("only", "call");

    expect(() => {
      expect(mock.fn).toHaveBeenNthCalledWithThis(
        2,
        expect.objectContaining({ id: "test" }),
        "second",
        "call",
      );
    }).toThrow(
      "Expected mock function to have been called at least 2 times, but it was called 1 times",
    );
  });

  it("fails when nth call context doesn't match", () => {
    const mock = {
      id: "correct-id",
      fn: vi.fn(),
    };

    mock.fn("first");
    mock.fn("second");

    expect(() => {
      expect(mock.fn).toHaveBeenNthCalledWithThis(
        2,
        expect.objectContaining({ id: "wrong-id" }),
        "second",
      );
    }).toThrow("Expected mock function to have been called the 2th time with");
  });

  it("fails when nth call arguments don't match", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("first");
    mock.fn("second");

    expect(() => {
      expect(mock.fn).toHaveBeenNthCalledWithThis(
        2,
        expect.objectContaining({ id: "test-id" }),
        "wrong",
      );
    }).toThrow("Expected mock function to have been called the 2th time with");
  });

  it("provides detailed error message for mismatched nth call", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("first", 1);
    mock.fn("second", 2);

    let caughtError: Error | undefined;

    try {
      expect(mock.fn).toHaveBeenNthCalledWithThis(
        2,
        expect.objectContaining({ id: "wrong-id" }),
        "wrong",
        "args",
      );
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toContain(
      "Expected mock function to have been called the 2th time with:",
    );
    expect(caughtError!.message).toContain("But the 2th call was:");
    expect(caughtError!.message).toContain('"second"');
    expect(caughtError!.message).toContain("2");
  });

  it("negation (.not) fails when nth call matches expected context and args", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("first", "call");
    mock.fn("second", "call");

    expect(() => {
      expect(mock.fn).not.toHaveBeenNthCalledWithThis(
        2,
        expect.objectContaining({ id: "test-id" }),
        "second",
        "call",
      );
    }).toThrow(
      "Expected mock function not to have been called the 2th time with",
    );
  });
});

describe("toHaveBeenCalledExactlyOnceWithThis", () => {
  it("passes when mock was called exactly once with correct context and arguments", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("single", "call");

    expect(mock.fn).toHaveBeenCalledExactlyOnceWithThis(
      expect.objectContaining({ id: "test-id" }),
      "single",
      "call",
    );
  });

  it("passes when mock was called exactly once with no arguments", () => {
    const mock = {
      value: 42,
      fn: vi.fn(),
    };

    mock.fn();

    expect(mock.fn).toHaveBeenCalledExactlyOnceWithThis(
      expect.objectContaining({ value: 42 }),
    );
  });

  it("fails when called on non-mock function", () => {
    const regularFunction = () => {};

    expect(() => {
      expect(regularFunction).toHaveBeenCalledExactlyOnceWithThis({}, "arg");
    }).toThrow("Expected a mock function");
  });

  it("fails when mock was never called", () => {
    const mock = {
      id: "test",
      fn: vi.fn(),
    };

    expect(() => {
      expect(mock.fn).toHaveBeenCalledExactlyOnceWithThis(
        expect.objectContaining({ id: "test" }),
        "call",
      );
    }).toThrow(
      "Expected mock function to have been called exactly once, but it was not called",
    );
  });

  it("fails when mock was called multiple times", () => {
    const mock = {
      id: "test",
      fn: vi.fn(),
    };

    mock.fn("first");
    mock.fn("second");

    expect(() => {
      expect(mock.fn).toHaveBeenCalledExactlyOnceWithThis(
        expect.objectContaining({ id: "test" }),
        "first",
      );
    }).toThrow(
      "Expected mock function to have been called exactly once, but it was called 2 times",
    );
  });

  it("fails when context doesn't match", () => {
    const mock = {
      id: "correct-id",
      fn: vi.fn(),
    };

    mock.fn("arg");

    expect(() => {
      expect(mock.fn).toHaveBeenCalledExactlyOnceWithThis(
        expect.objectContaining({ id: "wrong-id" }),
        "arg",
      );
    }).toThrow("Expected mock function to have been called exactly once with");
  });

  it("fails when arguments don't match", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("correct");

    expect(() => {
      expect(mock.fn).toHaveBeenCalledExactlyOnceWithThis(
        expect.objectContaining({ id: "test-id" }),
        "wrong",
      );
    }).toThrow("Expected mock function to have been called exactly once with");
  });

  it("provides detailed error message for multiple calls", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("first", 1);
    mock.fn("second", 2);
    mock.fn("third", 3);

    let caughtError: Error | undefined;

    try {
      expect(mock.fn).toHaveBeenCalledExactlyOnceWithThis(
        expect.objectContaining({ id: "test-id" }),
        "first",
        1,
      );
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toContain(
      "Expected mock function to have been called exactly once, but it was called 3 times:",
    );
    expect(caughtError!.message).toContain("Call 1:");
    expect(caughtError!.message).toContain("Call 2:");
    expect(caughtError!.message).toContain("Call 3:");
    expect(caughtError!.message).toContain('"first"');
    expect(caughtError!.message).toContain('"second"');
    expect(caughtError!.message).toContain('"third"');
  });

  it("provides detailed error message for mismatched single call", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("actual", "call");

    let caughtError: Error | undefined;

    try {
      expect(mock.fn).toHaveBeenCalledExactlyOnceWithThis(
        expect.objectContaining({ id: "wrong-id" }),
        "expected",
        "call",
      );
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toContain(
      "Expected mock function to have been called exactly once with:",
    );
    expect(caughtError!.message).toContain("But it was called once with:");
    expect(caughtError!.message).toContain('"actual"');
    expect(caughtError!.message).toContain('"expected"');
  });

  it("negation (.not) fails when mock was called exactly once with expected context and args", () => {
    const mock = {
      id: "test-id",
      fn: vi.fn(),
    };

    mock.fn("expected", "args");

    expect(() => {
      expect(mock.fn).not.toHaveBeenCalledExactlyOnceWithThis(
        expect.objectContaining({ id: "test-id" }),
        "expected",
        "args",
      );
    }).toThrow(
      "Expected mock function not to have been called exactly once with",
    );
  });
});

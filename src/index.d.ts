import "vitest";

declare module "vitest" {
  interface Assertion<T = any> {
    /**
     * Asserts that a mock function was called with a specific `this` context and arguments.
     * 
     * @param expectedThis - The expected `this` context object the function should have been called with
     * @param expectedArgs - The expected arguments the function should have been called with
     * @returns The assertion result
     * 
     * @example
     * ```javascript
     * const mock = { id: "test", fn: vi.fn() };
     * mock.fn("arg1", 123);
     * expect(mock.fn).toHaveBeenCalledWithThis(
     *   expect.objectContaining({ id: "test" }),
     *   "arg1", 
     *   123
     * );
     * ```
     * 
     * @see expect-extensions.js
     */
    toHaveBeenCalledWithThis(expectedThis: any, ...expectedArgs: any[]): T;
  }
}

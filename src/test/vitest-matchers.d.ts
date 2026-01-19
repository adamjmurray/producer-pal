import "vitest";

declare module "vitest" {
  interface Assertion<T = unknown> {
    /** Assert mock was called with specific this context and args */
    toHaveBeenCalledWithThis(
      expectedThis: unknown,
      ...expectedArgs: unknown[]
    ): T;
    /** Assert mock's nth call had specific this context and args */
    toHaveBeenNthCalledWithThis(
      nthCall: number,
      expectedThis: unknown,
      ...expectedArgs: unknown[]
    ): T;
    /** Assert mock was called exactly once with specific this context and args */
    toHaveBeenCalledExactlyOnceWithThis(
      expectedThis: unknown,
      ...expectedArgs: unknown[]
    ): T;
  }
}

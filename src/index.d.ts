import "vitest";

declare module "vitest" {
  interface Assertion<T = any> {
    /**
     * @see expect-extensions.js
     */
    toHaveBeenCalledWithThis(expectedThis: any, ...expectedArgs: any[]): T;
  }
}

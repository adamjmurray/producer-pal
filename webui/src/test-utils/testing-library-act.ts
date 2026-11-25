// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import type * as Lib from "@testing-library/preact";
import { act } from "preact/test-utils";
import { afterEach } from "vitest";

type TestingLibrary = typeof Lib;

/**
 * Wraps every unmount in `act()`. Preact 11 defers `useEffect` cleanups to
 * after paint, and `@testing-library/preact` unmounts outside `act()`, so
 * without this a test asserting on cleanup runs before the cleanup does.
 * Replaces the library's auto-cleanup (skipped via PTL_SKIP_AUTO_CLEANUP).
 * @param lib - The real `@testing-library/preact` module
 * @returns The module with act-wrapped render, renderHook and cleanup
 */
export function withTestingLibraryAct(lib: TestingLibrary): TestingLibrary {
  const cleanup = (): void => {
    void act(lib.cleanup);
  };

  afterEach(cleanup);

  return {
    ...lib,
    cleanup,
    render: actOnUnmount(lib.render),
    renderHook: actOnUnmount(lib.renderHook),
  };
}

/**
 * Wraps a render function so its result's `unmount` runs inside `act()`.
 * @param renderFn - `render` or `renderHook`
 * @returns The same function with an act-wrapped `unmount`
 */
function actOnUnmount<F extends (...args: never[]) => { unmount: () => void }>(
  renderFn: F,
): F {
  return ((...args: Parameters<F>) => {
    const result = renderFn(...args);

    return {
      ...result,
      unmount: () => {
        void act(result.unmount);
      },
    };
  }) as F;
}

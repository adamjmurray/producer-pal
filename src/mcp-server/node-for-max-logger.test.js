import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as logger from "./node-for-max-logger.js";

describe("Node for Max Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("log", () => {
    it("should always post with timestamp", () => {
      logger.log("test message");

      expect(Max.post).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] test message$/,
        ),
      );
    });
  });

  describe("warn", () => {
    it("should post with warn level", () => {
      logger.warn("test warning");

      expect(Max.post).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] test warning$/,
        ),
        Max.POST_LEVELS.WARN,
      );
    });
  });

  describe("error", () => {
    it("should post with error level", () => {
      logger.error("test error");

      expect(Max.post).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] test error$/,
        ),
        Max.POST_LEVELS.ERROR,
      );
    });
  });

  describe("info", () => {
    it("should not post when verbose is false (default)", () => {
      logger.info("test info");

      expect(Max.post).not.toHaveBeenCalled();
    });

    it("should post when verbose is enabled with 1", () => {
      // Get the verbose handler from Max.handlers map
      const verboseHandler = Max.handlers.get("verbose");

      expect(verboseHandler).toBeDefined();

      // Enable verbose mode with 1
      verboseHandler(1);
      logger.info("verbose info message");

      expect(Max.post).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] verbose info message$/,
        ),
      );
    });

    it("should post when verbose is enabled with 'true'", () => {
      const verboseHandler = Max.handlers.get("verbose");

      verboseHandler("true");
      logger.info("verbose string true message");

      expect(Max.post).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] verbose string true message$/,
        ),
      );
    });

    it("should not post when verbose is disabled with 0", () => {
      const verboseHandler = Max.handlers.get("verbose");

      verboseHandler(0);
      logger.info("should not post");

      expect(Max.post).not.toHaveBeenCalled();
    });

    it("should not post when verbose is disabled with false", () => {
      const verboseHandler = Max.handlers.get("verbose");

      verboseHandler(false);
      logger.info("should not post");

      expect(Max.post).not.toHaveBeenCalled();
    });
  });
});

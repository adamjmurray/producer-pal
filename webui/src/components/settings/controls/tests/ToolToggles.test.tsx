// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { type McpTool } from "#webui/hooks/connection/use-mcp-connection";
import { ToolToggles } from "#webui/components/settings/controls/ToolToggles";

const TEST_TOOLS: McpTool[] = [
  {
    id: "ppal-connect",
    name: "Connect to Ableton",
    description: "Connect and initialize",
  },
  {
    id: "ppal-read-live-set",
    name: "Read Live Set",
    description: "Read live set overview",
  },
  { id: "ppal-create-track", name: "Create Track" },
];

describe("ToolToggles", () => {
  const defaultProps = {
    tools: TEST_TOOLS,
    mcpStatus: "connected" as const,
    enabledTools: {
      "ppal-connect": true,
      "ppal-read-live-set": true,
      "ppal-create-track": true,
    },
    setEnabledTools: vi.fn(),
    liveApiEnabled: false,
    setLiveApiEnabled: vi.fn(),
    liveApiForcedOn: false,
    notation: "barbeat" as const,
    setNotation: vi.fn(),
    settingsConfigured: true,
  };

  /**
   * Render with the Live API toggle forced on, click `buttonName`, and assert the
   * bulk action left the forced toggle alone.
   * @param buttonName - Accessible name of the bulk-action button to click
   */
  function expectForcedLiveApiPreserved(buttonName: string): void {
    const setLiveApiEnabled = vi.fn();

    render(
      <ToolToggles
        {...defaultProps}
        liveApiEnabled={true}
        liveApiForcedOn={true}
        setLiveApiEnabled={setLiveApiEnabled}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: buttonName }));
    expect(setLiveApiEnabled).not.toHaveBeenCalled();
  }

  describe("basic rendering", () => {
    it("renders title", () => {
      render(<ToolToggles {...defaultProps} />);
      expect(screen.getByText("Available Tools")).toBeDefined();
    });

    it("renders Enable default toolset button", () => {
      render(<ToolToggles {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: "Enable default toolset" }),
      ).toBeDefined();
    });

    it("renders Disable all button", () => {
      render(<ToolToggles {...defaultProps} />);
      expect(screen.getByRole("button", { name: "Disable all" })).toBeDefined();
    });

    it("renders all tools", () => {
      render(<ToolToggles {...defaultProps} />);

      expect(screen.getByLabelText("Connect to Ableton")).toBeDefined();
      expect(screen.getByLabelText("Read Live Set")).toBeDefined();
      expect(screen.getByLabelText("Create Track")).toBeDefined();
    });

    it("renders group headers for each tool category", () => {
      render(<ToolToggles {...defaultProps} />);

      expect(screen.getByText("Core")).toBeDefined();
      expect(screen.getByText("Live Set")).toBeDefined();
      expect(screen.getByText("Track")).toBeDefined();
    });
  });

  describe("loading and error states", () => {
    it("shows loading message when tools are null and connecting", () => {
      render(
        <ToolToggles {...defaultProps} tools={null} mcpStatus="connecting" />,
      );

      expect(screen.getByText("Loading tools...")).toBeDefined();
      expect(screen.queryByRole("checkbox")).toBeNull();
    });

    it("shows error message when tools are null and status is error", () => {
      render(<ToolToggles {...defaultProps} tools={null} mcpStatus="error" />);

      expect(screen.getByText("Tools cannot be loaded")).toBeDefined();
      expect(screen.queryByRole("checkbox")).toBeNull();
    });
  });

  describe("button interactions", () => {
    // Live API is opt-in — never set true by either bulk action — and is
    // server-mirrored, so it never appears in the enabledTools record.
    it.each([
      {
        button: "Enable default toolset",
        expectedTools: {
          "ppal-connect": true,
          "ppal-read-live-set": true,
          "ppal-create-track": true,
        },
      },
      {
        button: "Disable all",
        expectedTools: {
          "ppal-connect": true,
          "ppal-read-live-set": false,
          "ppal-create-track": false,
        },
      },
    ])(
      "$button updates tool map and disables Live API",
      ({ button, expectedTools }) => {
        const setEnabledTools = vi.fn();
        const setLiveApiEnabled = vi.fn();

        render(
          <ToolToggles
            {...defaultProps}
            liveApiEnabled={true}
            setEnabledTools={setEnabledTools}
            setLiveApiEnabled={setLiveApiEnabled}
          />,
        );

        fireEvent.click(screen.getByRole("button", { name: button }));

        expect(setEnabledTools).toHaveBeenCalledExactlyOnceWith(expectedTools);
        expect(setLiveApiEnabled).toHaveBeenCalledExactlyOnceWith(false);
      },
    );

    it.each([{ button: "Enable default toolset" }, { button: "Disable all" }])(
      "$button omits the Live API tool from the map",
      ({ button }) => {
        const setEnabledTools = vi.fn();
        const tools: McpTool[] = [
          ...TEST_TOOLS,
          { id: "ppal-live-api", name: "Live API From Server" },
        ];

        render(
          <ToolToggles
            {...defaultProps}
            tools={tools}
            setEnabledTools={setEnabledTools}
          />,
        );

        fireEvent.click(screen.getByRole("button", { name: button }));

        const map = setEnabledTools.mock.calls[0]?.[0] as Record<
          string,
          boolean
        >;

        expect(map).not.toHaveProperty("ppal-live-api");
        expect(map).toHaveProperty("ppal-read-live-set");
      },
    );

    it("Enable default toolset preserves Live API when forced on", () => {
      expectForcedLiveApiPreserved("Enable default toolset");
    });
  });

  describe("tool descriptions", () => {
    it("renders info icons for tools with descriptions", () => {
      render(<ToolToggles {...defaultProps} />);
      const infoButtons = screen.getAllByRole("button", {
        name: "Tool description",
      });

      // connect description + read-live-set description + injected Live API
      // fallback description + injected Subagent description + header tooltip +
      // notation selector tooltip = 6
      expect(infoButtons).toHaveLength(6);
    });

    it("does not render info icon for tools without descriptions", () => {
      const tools: McpTool[] = [
        { id: "ppal-create-track", name: "Create Track" },
      ];

      render(<ToolToggles {...defaultProps} tools={tools} />);
      const infoButtons = screen.getAllByRole("button", {
        name: "Tool description",
      });

      // header tooltip + injected Live API fallback description + injected
      // Subagent description + notation selector tooltip = 4
      expect(infoButtons).toHaveLength(4);
    });
  });

  describe("checkbox interactions", () => {
    it("all checkboxes are checked when all tools are enabled", () => {
      render(<ToolToggles {...defaultProps} />);

      const checkbox = screen.getByLabelText(
        "Connect to Ableton",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
    });

    it("checkbox is unchecked when tool is disabled", () => {
      const enabledTools = {
        ...defaultProps.enabledTools,
        "ppal-read-live-set": false,
      };

      render(<ToolToggles {...defaultProps} enabledTools={enabledTools} />);

      const checkbox = screen.getByLabelText(
        "Read Live Set",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(false);
    });

    it("checkbox defaults to checked when tool is not in enabledTools", () => {
      // Pass empty object - tools not in enabledTools should default to enabled (true)
      render(<ToolToggles {...defaultProps} enabledTools={{}} />);

      const checkbox = screen.getByLabelText(
        "Read Live Set",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
    });

    it("calls setEnabledTools when checkbox is toggled", () => {
      const setEnabledTools = vi.fn();

      render(
        <ToolToggles {...defaultProps} setEnabledTools={setEnabledTools} />,
      );

      const checkbox = screen.getByLabelText("Read Live Set");

      fireEvent.click(checkbox);

      expect(setEnabledTools).toHaveBeenCalledOnce();
      const call = setEnabledTools.mock.calls[0]?.[0];

      expect(call?.["ppal-read-live-set"]).toBe(false); // Was true, now false
    });

    it("connect tool checkbox is always checked and disabled", () => {
      render(
        <ToolToggles
          {...defaultProps}
          enabledTools={{ "ppal-connect": false }}
        />,
      );

      const checkbox = screen.getByLabelText(
        "Connect to Ableton",
      ) as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
      expect(checkbox.disabled).toBe(true);
    });

    it("does not call setEnabledTools when connect tool checkbox is clicked", () => {
      const setEnabledTools = vi.fn();

      render(
        <ToolToggles {...defaultProps} setEnabledTools={setEnabledTools} />,
      );

      const checkbox = screen.getByLabelText("Connect to Ableton");

      fireEvent.click(checkbox);

      expect(setEnabledTools).not.toHaveBeenCalled();
    });

    it("handleToggle early-returns for an always-disabled tool", () => {
      const setEnabledTools = vi.fn();

      render(
        <ToolToggles {...defaultProps} setEnabledTools={setEnabledTools} />,
      );

      // Dispatch the change event directly: disabled inputs suppress a synthetic
      // click's change, so fire it explicitly to run handleToggle and hit its
      // isToolDisabled guard for the always-enabled connect tool.
      fireEvent.change(screen.getByLabelText("Connect to Ableton"));

      expect(setEnabledTools).not.toHaveBeenCalled();
    });
  });

  describe("Live API checkbox", () => {
    it("renders a Live API checkbox even when not in mcpTools", () => {
      // tools list with no ppal-live-api entry — covers the server-disabled
      // case where listTools() filters it out
      render(<ToolToggles {...defaultProps} />);
      expect(screen.getByLabelText("Live API")).toBeDefined();
    });

    it("Live API checkbox reflects liveApiEnabled prop, not enabledTools", () => {
      render(
        <ToolToggles
          {...defaultProps}
          enabledTools={{ "ppal-live-api": false }}
          liveApiEnabled={true}
        />,
      );

      const checkbox = screen.getByLabelText("Live API") as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
    });

    it("Live API checkbox unchecked when liveApiEnabled is false", () => {
      render(<ToolToggles {...defaultProps} liveApiEnabled={false} />);

      const checkbox = screen.getByLabelText("Live API") as HTMLInputElement;

      expect(checkbox.checked).toBe(false);
    });

    it("clicking Live API checkbox calls setLiveApiEnabled, not setEnabledTools", () => {
      const setEnabledTools = vi.fn();
      const setLiveApiEnabled = vi.fn();

      render(
        <ToolToggles
          {...defaultProps}
          liveApiEnabled={false}
          setEnabledTools={setEnabledTools}
          setLiveApiEnabled={setLiveApiEnabled}
        />,
      );

      fireEvent.click(screen.getByLabelText("Live API"));

      expect(setLiveApiEnabled).toHaveBeenCalledExactlyOnceWith(true);
      expect(setEnabledTools).not.toHaveBeenCalled();
    });

    it("uses MCP server's Live API tool entry when present", () => {
      const tools: McpTool[] = [
        ...TEST_TOOLS,
        {
          id: "ppal-live-api",
          name: "Live API From Server",
          description: "Server description",
        },
      ];

      render(<ToolToggles {...defaultProps} tools={tools} />);
      // Server entry preferred over the fallback injection
      expect(screen.getByLabelText("Live API From Server")).toBeDefined();
      expect(screen.queryByLabelText("Live API")).toBeNull();
    });

    it("disables the Live API checkbox when liveApiForcedOn is true", () => {
      render(
        <ToolToggles
          {...defaultProps}
          liveApiEnabled={true}
          liveApiForcedOn={true}
        />,
      );

      const checkbox = screen.getByLabelText("Live API") as HTMLInputElement;

      expect(checkbox.disabled).toBe(true);
      expect(checkbox.checked).toBe(true);
    });

    it("announces why the Live API checkbox is disabled when forced on", () => {
      render(
        <ToolToggles
          {...defaultProps}
          liveApiEnabled={true}
          liveApiForcedOn={true}
        />,
      );

      const checkbox = screen.getByLabelText("Live API") as HTMLInputElement;
      const reason = "Forced on by ENABLE_LIVE_API build flag";

      expect(checkbox.title).toBe(reason);
      expect(checkbox.getAttribute("aria-describedby")).toBe(
        "tool-ppal-live-api-reason",
      );

      const describer = document.getElementById("tool-ppal-live-api-reason");

      expect(describer?.textContent).toBe(reason);
    });

    it("omits the disabled-reason hint when Live API is not forced on", () => {
      render(
        <ToolToggles
          {...defaultProps}
          liveApiEnabled={false}
          liveApiForcedOn={false}
        />,
      );

      const checkbox = screen.getByLabelText("Live API") as HTMLInputElement;

      expect(checkbox.title).toBe("");
      expect(checkbox.hasAttribute("aria-describedby")).toBe(false);
      expect(document.getElementById("tool-ppal-live-api-reason")).toBeNull();
    });

    it("does not call setLiveApiEnabled when clicking a forced-on checkbox", () => {
      const setLiveApiEnabled = vi.fn();

      render(
        <ToolToggles
          {...defaultProps}
          liveApiEnabled={true}
          liveApiForcedOn={true}
          setLiveApiEnabled={setLiveApiEnabled}
        />,
      );

      // disabled inputs don't fire change events on click, but exercise the
      // handler defensively to pin the guard
      fireEvent.click(screen.getByLabelText("Live API"));
      expect(setLiveApiEnabled).not.toHaveBeenCalled();
    });

    it("Disable all preserves Live API when forced on", () => {
      expectForcedLiveApiPreserved("Disable all");
    });
  });

  describe("notation selector", () => {
    it("renders the Notation dropdown (in the Advanced group)", () => {
      render(<ToolToggles {...defaultProps} notation="midi-json" />);

      const select = screen.getByTestId("notation-select") as HTMLSelectElement;

      expect(select.value).toBe("midi-json");
    });

    it("calls setNotation when a new notation is picked", () => {
      const setNotation = vi.fn();

      render(
        <ToolToggles
          {...defaultProps}
          notation="barbeat"
          setNotation={setNotation}
        />,
      );

      fireEvent.change(screen.getByTestId("notation-select"), {
        target: { value: "stark" },
      });
      expect(setNotation).toHaveBeenCalledWith("stark");
    });
  });

  describe("Edit Context shortcut", () => {
    it("omits the Edit Context button when onEditContext is not provided", () => {
      render(<ToolToggles {...defaultProps} />);

      expect(screen.queryByRole("button", { name: "Edit Context" })).toBeNull();
    });

    it("renders an Edit Context button (Core group) and fires the handler", () => {
      const onEditContext = vi.fn();

      render(<ToolToggles {...defaultProps} onEditContext={onEditContext} />);

      fireEvent.click(screen.getByRole("button", { name: "Edit Context" }));

      expect(onEditContext).toHaveBeenCalledOnce();
    });

    it("disables the Edit Context button until settings are configured", () => {
      const onEditContext = vi.fn();

      render(
        <ToolToggles
          {...defaultProps}
          onEditContext={onEditContext}
          settingsConfigured={false}
        />,
      );

      const button = screen.getByRole("button", {
        name: "Edit Context",
      }) as HTMLButtonElement;

      expect(button.disabled).toBe(true);
      expect(button.title).toBe("Configure settings first");

      fireEvent.click(button);

      expect(onEditContext).not.toHaveBeenCalled();
    });
  });

  describe("Subagent checkbox", () => {
    it("renders a Subagent checkbox even when not in mcpTools", () => {
      render(<ToolToggles {...defaultProps} />);

      expect(screen.getByLabelText("Subagent")).toBeDefined();
    });

    it("is unchecked by default (opt-in) when not in enabledTools", () => {
      render(<ToolToggles {...defaultProps} enabledTools={{}} />);

      const checkbox = screen.getByLabelText("Subagent") as HTMLInputElement;

      expect(checkbox.checked).toBe(false);
    });

    it("is checked only when explicitly enabled", () => {
      render(
        <ToolToggles
          {...defaultProps}
          enabledTools={{ spawn_subagent: true }}
        />,
      );

      const checkbox = screen.getByLabelText("Subagent") as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
    });

    it("enables the Subagent tool when its checkbox is clicked", () => {
      const setEnabledTools = vi.fn();

      render(
        <ToolToggles
          {...defaultProps}
          enabledTools={{}}
          setEnabledTools={setEnabledTools}
        />,
      );

      fireEvent.click(screen.getByLabelText("Subagent"));

      expect(setEnabledTools).toHaveBeenCalledOnce();
      expect(setEnabledTools.mock.calls[0]?.[0]?.spawn_subagent).toBe(true);
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Shared helpers for creating routing mock properties in tests.
 * Used by both read-track and read-live-set tests.
 */

interface RoutingMockProperties {
  available_input_routing_channels?: string[];
  available_input_routing_types?: string[];
  available_output_routing_channels?: string[];
  available_output_routing_types?: string[];
  input_routing_channel?: string[];
  input_routing_type?: string[];
  output_routing_channel?: string[];
  output_routing_type?: string[];
  current_monitoring_state?: number[];
  [key: string]: unknown;
}

/**
 * Creates minimal routing mock properties with a single channel per type.
 * Use for tests that just need valid routing data without complex scenarios.
 * @param overrides - Properties to override the defaults
 * @returns Routing properties for track mocks
 */
export function createSimpleRoutingMock(
  overrides: RoutingMockProperties = {},
): RoutingMockProperties {
  return {
    available_input_routing_channels: [
      '{"available_input_routing_channels": [{"display_name": "In 1", "identifier": 1}]}',
    ],
    available_input_routing_types: [
      '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}]}',
    ],
    available_output_routing_channels: [
      '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}]}',
    ],
    available_output_routing_types: [
      '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}]}',
    ],
    input_routing_channel: [
      '{"input_routing_channel": {"display_name": "In 1", "identifier": 1}}',
    ],
    input_routing_type: [
      '{"input_routing_type": {"display_name": "Ext. In", "identifier": 17}}',
    ],
    output_routing_channel: [
      '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
    ],
    output_routing_type: [
      '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
    ],
    current_monitoring_state: [1],

    ...overrides,
  };
}

/**
 * Creates output-only routing mock properties for group/return/master tracks.
 * @param overrides - Properties to override the defaults
 * @returns Output routing properties
 */
export function createOutputOnlyRoutingMock(
  overrides: RoutingMockProperties = {},
): RoutingMockProperties {
  return {
    available_output_routing_channels: [
      '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}]}',
    ],
    available_output_routing_types: [
      '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}]}',
    ],
    output_routing_channel: [
      '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
    ],
    output_routing_type: [
      '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
    ],
    ...overrides,
  };
}

/**
 * Shared helpers for creating routing mock properties in tests.
 * Used by both read-track and read-live-set tests.
 */

/**
 * Creates minimal routing mock properties with a single channel per type.
 * Use for tests that just need valid routing data without complex scenarios.
 * @param {object} [overrides] - Properties to override the defaults
 * @returns {object} Routing properties for track mocks
 */
export function createSimpleRoutingMock(overrides = {}) {
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
 * @param {object} [overrides] - Properties to override the defaults
 * @returns {object} Output routing properties
 */
export function createOutputOnlyRoutingMock(overrides = {}) {
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

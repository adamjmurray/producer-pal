# Producer Pal Development Patterns

## NUX Pattern

New user experiences are implemented via tool description instructions that
Claude can interpret contextually, not via dynamic response data.

Example: The read-song tool includes welcome instructions that Claude adapts
based on conversation context. No session state needed.

Benefits:

- Zero infrastructure complexity
- Natural conversation awareness
- User-customizable (future feature)
- Already proven to work well

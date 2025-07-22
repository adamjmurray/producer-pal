# Producer Pal Development Patterns

## NUX Pattern

New user experiences are implemented via tool description instructions that
Claude can interpret contextually, not via dynamic response data.

Example: The ppal-read-song tool includes welcome instructions that Claude
adapts based on conversation context. No session state needed.

Benefits:

- Zero infrastructure complexity
- Natural conversation awareness
- User-customizable (future feature)
- Already proven to work well

## Tool Instructions Over Code Complexity

When providing contextual help or adaptive behavior, prefer tool description
instructions over adding code complexity. Let Claude's intelligence handle
context-aware responses rather than encoding rules in JavaScript.

### When to Use Tool Instructions

Good candidates:

- Noticing patterns in data (e.g., missing instruments on MIDI tracks)
- Providing contextual warnings or tips
- Adapting messages based on Live Set state
- Educational guidance about best practices
- Any behavior that benefits from natural language understanding

### When to Use Code Instead

- Data transformation or calculations
- Information needed by other tools
- State changes in Live
- Anything requiring deterministic behavior

### Examples

1. **Welcome Message** (already implemented): Instead of session state tracking,
   the ppal-read-song tool includes instructions for first-time greetings
2. **Missing Instruments**: Instead of adding `missingInstrument` flags,
   instructions tell Claude to notice and mention tracks without instruments
3. **Future**: Customization will let users override these instructions without
   code changes

### Benefits

- **Simplicity**: No new data structures or conditional logic
- **Flexibility**: Claude adapts messages to conversation context
- **Maintainability**: Fewer code paths to test
- **User Customizable**: Future feature will expose these for editing

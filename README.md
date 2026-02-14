# Block Stack Simulator

## Core Domain Definitions

### Stack Portfolio
A **stack portfolio** is a saved configuration template (blueprint) that defines how stacks should be created.

A stack portfolio includes:
- Portfolio name (for example, `TFSA`)
- Crate layout (which crates exist and each crate's slot count target)
- Block value
- Rules/settings that define generation and behavior of stacks

A stack portfolio does **not** contain progress. It is used to create stack instances.

Changing a portfolio affects **future stacks only** and does not modify historical stack instances that already exist.

### Stack
A **stack** is a runtime instance created from a stack portfolio.

A stack contains live progress state, including:
- The rendered crates for that stack instance
- Filled slots
- Waiting room blocks
- Cycle/time progress
- Completed/full state

Multiple stacks can be created from one stack portfolio over time.

Completing a stack does **not** modify the portfolio template. Instead, the app creates a new stack instance under the same portfolio.

## Relationship
- **Portfolio → creates → many Stacks**
- Portfolio = template
- Stack = live state/progress

## Completion Behavior
A stack is completed/full when:
- All crate slots for one stack instance are filled
- Every slot contains a cash block
- No remaining capacity exists in that stack instance

When a stack is filled, the app must:
- Automatically create a new empty stack instance under the same portfolio
- Show the new stack as the next card in the stack carousel
- Allow swiping through stack history within the selected portfolio (completed stacks + current active stack)

By default, swipe controls can remain hidden/disabled until a portfolio has at least 2 stacks.

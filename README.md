# Block Stack Simulator

## Core Domain Definitions

### Stack Portfolio
A **stack portfolio** is the saved template + accounting model created from survey/settings. It includes:
- Portfolio name
- Block value (cash block dollar unit)
- Investments (crate definitions)
- Target percentages
- Slot plan per investment crate
- Overflow growth rates
- Canonical portfolio spreadsheet holdings

The stack portfolio is the source of truth. Visual stacks are projections of this data.

### Stack (Stack Card / Instance)
A **stack** is one sequential visual card in the projection. Each stack card contains one crate per investment.
Multiple stack cards can exist under one stack portfolio.

### Crate (Investment)
A **crate** is one investment target (for example `HDIV`) represented once per stack card.

### Cash Block
A **cash block** is one full monetary unit equal to `blockValue` dollars.

### Overflow Cursor
An **overflow cursor** is fractional growth (< 1 block) for an investment and is rendered only inside that investment crate.
Overflow exists only when an investment already has at least one full block.

## Canonical Portfolio Spreadsheet
The app uses a single canonical spreadsheet model that tracks:
- Waiting-room cash blocks
- Per-investment full block counts
- Per-investment overflow dollars
- Template metadata (targets, slots, rates)
- Typed ledger events

All mutations flow through the spreadsheet first, then the runtime stack-card projection is recalculated.

## Projection Rules
- Blocks are placed using the **earliest available slot** for that investment across all stacks.
- If additional value cannot fit in a crate on earlier stacks, a new stack card is created automatically.
- Overflow converts to a full green cash block once it reaches one full block value.
- Overflow is independent per investment.

## Completion Behavior
A stack card is considered full when all crate slots on that card are filled with full cash blocks.
New stack cards are created as needed by projection when holdings exceed current stack capacity for any investment.

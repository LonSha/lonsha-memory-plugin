# Agent Note: L14-X6 scene character seating partition
Status: implemented

## Problem & Motivation
In multi-character scenes, generating dialogue from a homogeneous memory dump causes private secrets to leak into public awareness. L14-X6 partitions knowledge according to active seating: shared pool (all present know), private pockets (only one present knows), partial subsets (2..N-1 present know), and embargoed secrets (no one present knows).

## Implementation Details
1. **Engine**: `scene-character-seating-partition.js`
   - `createSeatingSession`: Tracks current scene seats.
   - `updateSeats`: Dynamically modifies seated characters.
   - `partitionMaterialsForSeats`: Automatically redistributes materials into sharedPool, partialSubsets, privatePockets, and embargoedSecrets based on the exact overlap with active seats.
   - `buildCharacterPerspectivePrompt`: Assembles a strictly gated context block per character, ensuring no private pocket spills into someone else's prompt.
2. **Integration**: Registered in `manifest.json` and wired up in `index.js`.
3. **Verification**: `tests/v3448_l14_x6_scene_seating_partition.test.mjs` (3 test cases).
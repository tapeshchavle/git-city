## Summary

This PR fixes targeted lint/tooling issues without changing intended runtime behavior for the affected effects/interactions components.

### What was fixed

1. **Broken lint rule reference**
   - Removed invalid ESLint disable comments referencing `react-compiler/react-compiler`.
   - File:
     - src/components/ThemeSkyFX.tsx

2. **Impure functions during render (`Math.random`, `Date.now`)**
   - Removed unused `Date.now()` initialization.
   - Reworked particle randomization in effects components to deterministic, seed-based generation using `pseudoRandom()`.
   - Moved mutable animation state into refs and updated it in `useFrame()`.
   - File:
     - src/components/RabbitCompletion.tsx
     - src/components/EffectsPOC.tsx

3. **Ref mutation during render**
   - Moved callback-ref synchronization from render path into `useEffect`.
   - Files:
     - src/components/FounderSpire.tsx (`onClickRef` sync)
     - src/components/WhiteRabbit.tsx (`onCaughtRef` sync)

4. **Related type-safety cleanup in same touched files**
   - Replaced `window as any` flags with typed window aliases.
   - Files:
     - src/components/FounderSpire.tsx
     - src/components/WhiteRabbit.tsx

---

## Detailed change list

### src/components/ThemeSkyFX.tsx
- Removed two invalid lint-disable comments for `react-compiler/react-compiler`.

### src/components/RabbitCompletion.tsx
- Removed unused `mountTime` (`useRef(Date.now())`) to avoid impure render call.

### src/components/FounderSpire.tsx
- Added `SpireWindowFlags` type.
- Synced `onClickRef.current` inside `useEffect([onClick])` instead of render.
- Replaced `window as any` usage with typed `w` flags (`__spireClicked`, `__spireCursor`).

### src/components/WhiteRabbit.tsx
- Added `RabbitWindowFlags` type.
- Synced `onCaughtRef.current` inside `useEffect([onCaught])` instead of render.
- Replaced `window as any` usage with typed `w` flags (`__rabbitClicked`, `__rabbitCursor`).

### src/components/EffectsPOC.tsx
- Added `useEffect` import where needed.
- Introduced deterministic `pseudoRandom()` usage for generated particle data.
- Added typed particle models and factories:
  - `CommitParticle` + `createCommitParticles(...)`
  - `StarfallParticle` + `createStarfallParticles(...)`
- Updated these effects to avoid impure render randomness and hook immutability violations:
  - `CommitStream`
  - `StarBeam`
  - `Starfall`
  - `StarOrbit`
- Added ref-based mutable animation/recycle state where required.
- Fixed `useMemo` dependencies for orbit generation.

---

## Validation

- Targeted lint check on edited files: **0 errors** (warnings may remain unrelated to requested scope).
- Production build: **passes** (`npm run build`).

---

## Risk / behavior notes

- Visual behavior is preserved intentionally (same effect classes and motion style).
- Random-looking effects now use deterministic seeded values per instance instead of render-time impurity.
- Event/click behavior remains unchanged; only callback-ref synchronization timing was corrected (render -> effect-safe sync).

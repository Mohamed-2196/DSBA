---
name: react-best-practices
description: React performance rules (Vercel Engineering's set, trimmed to what applies to a Vite single-page app on React 18 with TanStack Query). Use when writing, reviewing or refactoring components in web/src, when a screen re-renders or loads slowly, or when adding a dependency or a heavy component.
license: MIT
---

# React best practices

Adapted from Vercel's `react-best-practices` skill
([vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), `skills/react-best-practices`, commit
063bee94c3f4, MIT licence; see NOTICE). The rules in `rules/` are Vercel's, unchanged. This file is rewritten for
this repo, and the rules that don't apply here are left out:
- server, API-route and hydration rules (Next.js server code; DSBA Hub's web app is a client-only Vite SPA);
- React 19-only APIs (`<Activity>`, `useEffectEvent`, resource hints);
- SWR and the `better-all` package.

## Read this first: how it maps to DSBA Hub

- **React 18.3 with React Router 7 and TanStack Query 5.** Where a rule shows `next/dynamic`, use `React.lazy` and
  the lazy routes in `web/src/routes.tsx`. Where it shows SWR, TanStack Query already deduplicates requests and
  shares the cache: put the hook in `features/<x>/api.ts` and reuse its query key.
- **Waterfalls usually live in queries here.**
  - Fetch independent things in parallel (`useQueries`, or two hooks side by side), not one after the other.
  - Prefetch on intent: `queryClient.prefetchQuery` on hover or focus.
- **Barrel files.** Each feature's `public.ts` is a small facade and stays. Don't re-export whole folders from it,
  and don't import icon or utility libraries through their barrel when a direct path exists.
- **Measure first.** Use the React DevTools profiler or `npx vite build` with the bundle report. Most rules here
  are LOW or MEDIUM: apply them where a profile shows a cost, not everywhere.

## How to use

Open the rule file for the full explanation and the incorrect and correct examples:
`rules/<name>.md`. `rules/_sections.md` explains each category.

## Quick reference

### Eliminating waterfalls (CRITICAL)

- `async-cheap-condition-before-await`: Check Cheap Conditions Before Async Flags
- `async-defer-await`: Defer Await Until Needed
- `async-parallel`: Promise.all() for Independent Operations

### Bundle size (CRITICAL)

- `bundle-analyzable-paths`: Prefer Statically Analyzable Paths
- `bundle-barrel-imports`: Avoid Barrel File Imports
- `bundle-conditional`: Conditional Module Loading
- `bundle-defer-third-party`: Defer Non-Critical Third-Party Libraries
- `bundle-dynamic-imports`: Dynamic Imports for Heavy Components
- `bundle-preload`: Preload Based on User Intent

### Client-side data and events (MEDIUM-HIGH)

- `client-event-listeners`: Deduplicate Global Event Listeners
- `client-localstorage-schema`: Version and Minimize localStorage Data
- `client-passive-event-listeners`: Use Passive Event Listeners for Scrolling Performance

### Re-render optimisation (MEDIUM)

- `rerender-defer-reads`: Defer State Reads to Usage Point
- `rerender-dependencies`: Narrow Effect Dependencies
- `rerender-derived-state-no-effect`: Calculate Derived State During Rendering
- `rerender-derived-state`: Subscribe to Derived State
- `rerender-functional-setstate`: Use Functional setState Updates
- `rerender-lazy-state-init`: Use Lazy State Initialization
- `rerender-memo-with-default-value`: Extract Default Non-primitive Parameter Value from Memoized Component to Constant
- `rerender-memo`: Extract to Memoized Components
- `rerender-move-effect-to-event`: Put Interaction Logic in Event Handlers
- `rerender-no-inline-components`: Don't Define Components Inside Components
- `rerender-simple-expression-in-memo`: Do not wrap a simple expression with a primitive result type in useMemo
- `rerender-split-combined-hooks`: Split Combined Hook Computations
- `rerender-transitions`: Use Transitions for Non-Urgent Updates
- `rerender-use-deferred-value`: Use useDeferredValue for Expensive Derived Renders
- `rerender-use-ref-transient-values`: Use useRef for Transient Values

### Rendering performance (MEDIUM)

- `rendering-animate-svg-wrapper`: Animate SVG Wrapper Instead of SVG Element
- `rendering-conditional-render`: Use Explicit Conditional Rendering
- `rendering-content-visibility`: CSS content-visibility for Long Lists
- `rendering-hoist-jsx`: Hoist Static JSX Elements
- `rendering-svg-precision`: Optimize SVG Precision
- `rendering-usetransition-loading`: Use useTransition Over Manual Loading States

### JavaScript performance (LOW-MEDIUM)

- `js-batch-dom-css`: Avoid Layout Thrashing
- `js-cache-function-results`: Cache Repeated Function Calls
- `js-cache-property-access`: Cache Property Access in Loops
- `js-cache-storage`: Cache Storage API Calls
- `js-combine-iterations`: Combine Multiple Array Iterations
- `js-early-exit`: Early Return from Functions
- `js-flatmap-filter`: Use flatMap to Map and Filter in One Pass
- `js-hoist-regexp`: Hoist RegExp Creation
- `js-index-maps`: Build Index Maps for Repeated Lookups
- `js-length-check-first`: Early Length Check for Array Comparisons
- `js-min-max-loop`: Use Loop for Min/Max Instead of Sort
- `js-request-idle-callback`: Defer Non-Critical Work with requestIdleCallback
- `js-set-map-lookups`: Use Set/Map for O(1) Lookups
- `js-tosorted-immutable`: Use toSorted() Instead of sort() for Immutability

### Advanced patterns (LOW)

- `advanced-event-handler-refs`: Store Event Handlers in Refs
- `advanced-init-once`: Initialize App Once, Not Per Mount

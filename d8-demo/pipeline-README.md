# d8 parse→generate pipeline: `import` vs `import defer`

A self-contained, **d8-runnable** ESM build of the Babel parse→generate pipeline
(`@babel/parser` + `@babel/types` + `@babel/generator`) that **preserves the module
graph**, so `import defer` can defer evaluation of conditionally-used (TypeScript/Flow)
subgraphs. Used to benchmark plain `import` against `import defer`.

## Build

```sh
make build                       # ensure packages/*/lib are built (unbundled ESM)
node d8-demo/build-pipeline.mjs  # assemble the two trees below
```

`build-pipeline.mjs` copies the three packages' `lib/` (ESM, 149 files each), vendors the
2 helper libs + a `jsesc` ESM shim under `vendor/`, rewrites the only bare specifiers
(`@babel/types`, `@babel/helper-*`, `jsesc`) to relative paths, stubs `generator/lib/source-map.js`
(source maps are off, avoids the `@jridgewell/*` subtree), and writes `run.js`. It emits:

- `pipeline/`        — eager baseline (plain `import`)
- `pipeline-defer/`  — defers the TS/Flow parser plugins + generator printers

## Run (d8)

`import defer` requires `--js-staging` in this V8 (15.1.0).

```sh
D8=/Users/caiolima/dev/v8/v8/out/arm64.release/d8

# eager baseline
$D8 --module              pipeline/run.js        -- "const x = a ?? b;"
# deferred, plain JS
$D8 --js-staging --module pipeline-defer/run.js  -- "const x = a ?? b;"
# deferred, TypeScript (3rd arg "ts" enables the parser typescript plugin)
$D8 --js-staging --module pipeline-defer/run.js  -- "const x: number = 1;" ts
```

Output is the regenerated code plus a steady-state `// parse+generate (cold…) ms` line. Eager
and defer produce **identical** output for both plain JS and TypeScript. (That `ms` line is NOT
the import-defer metric — see **Measuring** below.)

## What defers, and what doesn't (verified with `print("EVAL …")` markers)

| Module                         | Size   | Plain-JS (defer tree)        |
|--------------------------------|--------|------------------------------|
| parser TS plugin               | 108 KB | ✅ NOT evaluated (deferred)  |
| parser Flow plugin             |  86 KB | ✅ NOT evaluated (deferred)  |
| generator TS printer           |  15 KB | ✅ NOT evaluated (deferred)  |
| generator Flow printer         |  ~     | ✅ NOT evaluated (deferred)  |

For TypeScript input, `parser-ts` and `gen-ts` evaluate **lazily** (only when TS is actually
processed); Flow stays unevaluated. Eager vs defer produce identical output throughout.

**Parser side** (the dominant ~194 KB win): the 6 plugins register through a single map in
`parser/lib/plugin-utils.js`; converting the TS/Flow entries to `import defer * as ns` + lazy
getters means plain-JS parsing never touches them, and the TS plugin evaluates lazily only when
TS is actually parsed.

**Generator side** required a small refactor first — a real `import defer` finding: the
always-loaded class-member printing path (`generator/lib/generators/classes.js`) eagerly
imported helpers that lived *inside* the TS/Flow printer modules:

```js
// generators/classes.js (before)
import { _tsPrintClassMemberModifiers } from "./typescript.js";
import { _variance } from "./flow.js";
```

Because `classes.js` is needed for ordinary JS, that eager import forced `typescript.js` and
`flow.js` to evaluate at startup, defeating the deferral. **Deferral only pays off when the
subgraph is cleanly separable.**

### Fix applied: extract the shared helpers
`build-pipeline.mjs` (defer tree only) extracts the self-contained helpers — `_variance`
(flow.js) and `_tsPrintClassMemberModifiers` + its helper `printModifiersList` (typescript.js)
— into a new always-loaded module `generators/_class-modifiers.js`. `classes.js` and `flow.js`
now import them from there, so `typescript.js`/`flow.js` are reachable *only* through the
deferred dispatch and no longer evaluate for plain JS (verified with the markers above).

## How the defer transform is applied (`build-pipeline.mjs`)
- **Parser (`plugin-utils.js`)**: TS/Flow `import` → `import defer * as _ns`; `mixinPlugins`
  TS/Flow entries become `get typescript()/get flow()` (lazy). `mixinPluginNames` stays correct
  because `Object.keys` does not invoke getters.
- **Generator (`nodes.js` + `generators/index.js`)**: drop TS/Flow from the eager barrel;
  rebuild the dispatch over the **full sorted key set** so each node-type keeps the **same
  `nodeId`** as eager (the parens logic depends on these ids — e.g. `printer.js` hardcodes
  `nodeId === 72`), with TS/Flow entries wrapped in lazy thunks. Printer key names are read via
  dynamic import of the original modules (catches alias exports like
  `TSTypeParameterInstantiation as TSTypeParameterDeclaration`).

## Measuring

```sh
sh d8-demo/measure.sh              # full benchmark (env: D8, K, N, JS, TS)
```

Two layers, because they answer different questions:

- **`run.js` timings are steady-state** — they run *after* the module graph is already loaded
  and evaluated, so they do **not** reflect deferral. Bench mode (`-- "<code>" js|ts <iters>`)
  loops `<iters>` times and reports `warm` ms/op; averaging is what gives sub-microsecond
  resolution (d8's `performance.now()` is quantized, so a single op reads as a coarse step).
- **`measure.sh` section A is process-level startup** — full d8 wall-clock including module
  *evaluation*. This is the only place the import-defer effect can appear.

### Result: deferral works, but the startup win here is negligible

Verified numbers (V8 15.1.0, Apple silicon; your mileage will vary):

| | startup (avg of 200) |
|---|---|
| eager, plain JS | ~41.4 ms |
| defer, plain JS | ~41.0 ms |

The defer tree provably never evaluates the TS/Flow modules on plain JS (the `EVAL`-marker
test), yet startup barely moves. Direct measurement of the *pure* deferred evaluation explains
why:

```
pure deferred-eval (TS+Flow parser plugins) ≈ 0.2 ms
```

**`import defer` defers top-level evaluation only.** Babel's parser/printer modules do almost
nothing at top level (they just define functions), so the evaluation it skips costs ~0.2 ms.
The dominant ~40 ms is V8 init plus *fetching, parsing and compiling* all 150 module files —
and that happens for deferred modules too (a statically `import defer`-ed module is still
loaded and parsed; only its body execution is postponed).

**Takeaway:** `import defer` pays off for modules with expensive top-level *initialization*
(building large tables, precomputing data, running setup) — not for modules that merely define
functions. To make this pipeline a showcase, defer a module that does real work at import time,
or measure parse/compile (not just evaluation), which `import defer` does not address.

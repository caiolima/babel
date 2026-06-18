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

Output is the regenerated code plus `// parse+generate ms: …`. Eager and defer produce
**identical** output for both plain JS and TypeScript.

## What defers, and what doesn't (verified with `print("EVAL …")` markers)

| Module                         | Size   | Plain-JS (defer tree)        |
|--------------------------------|--------|------------------------------|
| parser TS plugin               | 108 KB | ✅ NOT evaluated (deferred)  |
| parser Flow plugin             |  86 KB | ✅ NOT evaluated (deferred)  |
| generator TS printer           |  15 KB | ❌ still evaluated (leaks)   |
| generator Flow printer         |  ~     | ❌ still evaluated (leaks)   |

**Parser side works cleanly** (the dominant ~194 KB win): the 6 plugins register through a
single map in `parser/lib/plugin-utils.js`; converting the TS/Flow entries to
`import defer * as ns` + lazy getters means plain-JS parsing never touches them, and the TS
plugin evaluates lazily only when TS is actually parsed.

**Generator side does not defer yet** — a real `import defer` finding: the always-loaded
class-member printing path (`generator/lib/generators/classes.js`) eagerly imports helpers
that live *inside* the TS/Flow printer modules:

```js
// generators/classes.js
import { _tsPrintClassMemberModifiers } from "./typescript.js";
import { _variance } from "./flow.js";
```

Because `classes.js` is needed for ordinary JS, that eager import forces `typescript.js` and
`flow.js` to evaluate at startup, defeating the deferral. **Deferral only pays off when the
subgraph is cleanly separable.**

### To make the generator side defer too (proposed, not yet applied)
Extract the shared helpers into a small always-loaded module (all are self-contained — they
only use `Printer` methods):

- `_variance` (flow.js), `_tsPrintClassMemberModifiers` + its helper `printModifiersList`
  (typescript.js) → new `generators/_class-modifiers.js`.
- `classes.js` and `flow.js` import them from the shared module instead of from the printer
  modules. Then `typescript.js`/`flow.js` are reachable *only* through the deferred dispatch
  and stop evaluating for plain JS.

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

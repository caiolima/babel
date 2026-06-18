// d8 entry for the Babel parse->generate pipeline.
//   demo:   d8 --module run.js -- "const x = a ?? b;"
//   defer:  d8 --js-staging --module run.js -- "const x = a ?? b;"
//   TS:     d8 --js-staging --module run.js -- "const x: number = 1;" ts
//   bench:  d8 --js-staging --module run.js -- "<code>" ts 5000   (3rd arg = warm iters)
//
// NOTE: timings here are STEADY-STATE (after the module graph is already loaded
// and evaluated). They do NOT show the import-defer startup win — eager module
// evaluation finishes before this script body runs. Use measure.sh for the
// process-level startup comparison that actually reflects deferral.
import { parse } from "./parser/lib/index.js";
import generate from "./generator/lib/index.js";

const argv = (typeof arguments !== "undefined" && arguments) || [];
const input = argv.length > 0 ? argv[0] : "const x = a ?? b;";
const isTS = argv.length > 1 && argv[1] === "ts";
const iters = argv.length > 2 ? (argv[2] | 0) : 0;
const opts = { sourceType: "module", plugins: isTS ? ["typescript"] : [] };

const run = () => generate(parse(input, opts)).code;

// cold = first op. In the defer tree this also pays the one-time lazy evaluation
// of any deferred module this input actually needs (e.g. the TS plugin/printer).
const t0 = performance.now();
const code = run();
const cold = performance.now() - t0;

if (iters > 0) {
  for (let i = 0; i < 100; i++) run(); // warm up the JIT
  const w0 = performance.now();
  for (let i = 0; i < iters; i++) run();
  const warm = (performance.now() - w0) / iters;
  print("// cold: " + cold.toFixed(3) + " ms;  warm: " + warm.toFixed(4) +
    " ms/op (avg of " + iters + ")");
} else {
  print(code);
  print("// parse+generate (cold, steady-state): " + cold.toFixed(3) + " ms");
}

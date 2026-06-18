// d8 entry for the Babel parse->generate pipeline.
//   eager:  d8 --module run.js -- "const x = a ?? b;"
//   defer:  d8 --js-staging --module run.js -- "const x = a ?? b;"
//   TS:     d8 --js-staging --module run.js -- "const x: number = 1;" ts
import { parse } from "./parser/lib/index.js";
import generate from "./generator/lib/index.js";

const argv = (typeof arguments !== "undefined" && arguments) || [];
const input = argv.length > 0 ? argv[0] : "const x = a ?? b;";
const isTS = argv.length > 1 && argv[1] === "ts";

const t0 = performance.now();
const ast = parse(input, { sourceType: "module", plugins: isTS ? ["typescript"] : [] });
const { code } = generate(ast);
const t1 = performance.now();

print(code);
print("// parse+generate ms: " + (t1 - t0).toFixed(2));

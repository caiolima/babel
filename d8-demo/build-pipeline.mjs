// Assembles self-contained, d8-runnable ESM trees of the Babel parse->generate
// pipeline (@babel/parser + @babel/types + @babel/generator), preserving the
// module graph so `import defer` can defer evaluation of conditionally-used
// (TypeScript/Flow) subgraphs.
//
// Emits two sibling trees (NOTE: this script must live OUTSIDE them, since it
// wipes each output dir before regenerating):
//   d8-demo/pipeline/        eager baseline (plain `import`)
//   d8-demo/pipeline-defer/  defers the TS/Flow parser plugins + generator printers
//
// Run with Node after `make build`:  node d8-demo/build-pipeline.mjs
// Then:
//   D8=/Users/caiolima/dev/v8/v8/out/arm64.release/d8
//   $D8 --module              d8-demo/pipeline/run.js        -- "const x = a ?? b;"
//   $D8 --js-staging --module d8-demo/pipeline-defer/run.js  -- "const x = a ?? b;"
//
// import defer requires --js-staging in this V8 (15.1.0). JSON modules
// (helper-validator-identifier data) work via `with { type: "json" }`.

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const demoDir = path.dirname(fileURLToPath(import.meta.url)); // d8-demo
const repoRoot = path.dirname(demoDir);
const pkg = name => path.join(repoRoot, "packages", name);

// The generator's printer-dispatch (nodes.js) registers Object.keys() of each
// printer module, skipping "_"-prefixed names. To defer typescript.js/flow.js we
// must know their exported node-type keys WITHOUT evaluating them in d8 — so we
// read the real export names here (Node resolves @babel/types fine). A regex
// misses alias exports like `export { X as TSTypeParameterDeclaration }`.
async function printerKeys(genRelFile) {
  const mod = await import(pathToFileURL(pkg(genRelFile)).href);
  return Object.keys(mod).filter(k => k !== "default" && !k.startsWith("_"));
}
const TS_KEYS = await printerKeys(
  "babel-generator/lib/generators/typescript.js"
);
const FLOW_KEYS = await printerKeys("babel-generator/lib/generators/flow.js");

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function copyJs(srcDir, destDir) {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyJs(src, dest);
    } else if (entry.name.endsWith(".js")) {
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, readFileSync(src, "utf8"));
    }
  }
}

function walkJs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(p));
    else if (entry.name.endsWith(".js")) out.push(p);
  }
  return out;
}

// proper relative ESM specifier from one output file to a target output file
function rel(fromFile, toFile) {
  let r = path
    .relative(path.dirname(fromFile), toFile)
    .split(path.sep)
    .join("/");
  if (!r.startsWith(".")) r = "./" + r;
  return r;
}

// ---------------------------------------------------------------------------
// build one tree
// ---------------------------------------------------------------------------

function buildTree(treeName, { defer }) {
  const tree = path.join(demoDir, treeName);
  rmSync(tree, { recursive: true, force: true });
  mkdirSync(tree, { recursive: true });

  // 1. copy the three package libs
  copyJs(pkg("babel-parser/lib"), path.join(tree, "parser/lib"));
  copyJs(pkg("babel-types/lib"), path.join(tree, "types/lib"));
  copyJs(pkg("babel-generator/lib"), path.join(tree, "generator/lib"));

  // generator/lib/source-map.js imports @jridgewell/{gen,trace}-mapping, but
  // SourceMap is only constructed when opts.sourceMaps is set (index.js:77) and
  // this benchmark never requests source maps. Stub it to avoid vendoring the
  // entire @jridgewell/* subtree.
  writeFileSync(
    path.join(tree, "generator/lib/source-map.js"),
    `// Stub: source maps are disabled in the d8 pipeline benchmark, so
// generate(ast) never constructs SourceMap. Avoids the @jridgewell/* deps.
export default class SourceMap {
  constructor() {
    throw new Error("SourceMap is stubbed out in the d8 pipeline build");
  }
}
`
  );

  // 2. vendor the shared helper packages + jsesc ESM shim
  copyJs(
    pkg("babel-helper-validator-identifier/lib"),
    path.join(tree, "vendor/helper-validator-identifier")
  );
  copyJs(
    pkg("babel-helper-string-parser/lib"),
    path.join(tree, "vendor/helper-string-parser")
  );
  // helper-validator-identifier/lib/identifier.js imports ../data/*.json (JSON
  // modules); relative to vendor/helper-validator-identifier that is
  // vendor/data/. d8 reads JSON modules via `with { type: "json" }`.
  const dataSrc = pkg("babel-helper-validator-identifier/data");
  const dataDest = path.join(tree, "vendor/data");
  mkdirSync(dataDest, { recursive: true });
  for (const f of readdirSync(dataSrc)) {
    if (f.endsWith(".json")) {
      writeFileSync(
        path.join(dataDest, f),
        readFileSync(path.join(dataSrc, f), "utf8")
      );
    }
  }
  const jsescSrc = readFileSync(
    path.join(repoRoot, "node_modules/jsesc/jsesc.js"),
    "utf8"
  );
  const jsescEsm = jsescSrc.replace(
    /module\.exports\s*=\s*jsesc;?/,
    "export default jsesc;"
  );
  if (jsescEsm === jsescSrc) throw new Error("jsesc: module.exports not found");
  if (/\brequire\s*\(/.test(jsescEsm))
    throw new Error("jsesc: unexpected require()");
  mkdirSync(path.join(tree, "vendor"), { recursive: true });
  writeFileSync(path.join(tree, "vendor/jsesc.mjs"), jsescEsm);

  // 3. rewrite bare specifiers -> relative paths (computed per importing file)
  const targets = {
    "@babel/helper-validator-identifier": path.join(
      tree,
      "vendor/helper-validator-identifier/index.js"
    ),
    "@babel/helper-string-parser": path.join(
      tree,
      "vendor/helper-string-parser/index.js"
    ),
    "@babel/types": path.join(tree, "types/lib/index.js"),
    jsesc: path.join(tree, "vendor/jsesc.mjs"),
  };
  let rewrites = 0;
  for (const file of walkJs(tree)) {
    let src = readFileSync(file, "utf8");
    let changed = false;
    for (const [bare, target] of Object.entries(targets)) {
      const token = `"${bare}"`;
      if (src.includes(token)) {
        src = src.split(token).join(`"${rel(file, target)}"`);
        changed = true;
        rewrites++;
      }
    }
    if (changed) writeFileSync(file, src);
  }

  // 4. defer edits (only for the defer tree)
  if (defer) {
    applyParserDefer(tree);
    applyGeneratorDefer(tree);
  }

  // 5. entry
  writeFileSync(path.join(tree, "run.js"), RUN_JS);

  // sanity: no bare specifiers should survive
  const leftover = [];
  for (const file of walkJs(tree)) {
    const m = readFileSync(file, "utf8").match(
      /from\s+"(@babel\/[^"]+|jsesc)"/
    );
    if (m) leftover.push(`${path.relative(repoRoot, file)} -> ${m[1]}`);
  }
  console.log(
    `${treeName}: ${walkJs(tree).length} js files, ${rewrites} specifier rewrites${
      defer ? ", defer edits applied" : ""
    }`
  );
  if (leftover.length) {
    console.error("  LEFTOVER bare specifiers:\n   " + leftover.join("\n   "));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// B1: parser-side defer (plugin-utils.js)
// ---------------------------------------------------------------------------

function applyParserDefer(tree) {
  const file = path.join(tree, "parser/lib/plugin-utils.js");
  let src = readFileSync(file, "utf8");

  src = src.replace(
    'import flow from "./plugins/flow/index.js";',
    'import defer * as _flow from "./plugins/flow/index.js";'
  );
  src = src.replace(
    'import typescript from "./plugins/typescript/index.js";',
    'import defer * as _typescript from "./plugins/typescript/index.js";'
  );

  // replace the mixinPlugins object literal with a lazy-getter version
  // (index-based splice to avoid a dot-all regex)
  const start = src.indexOf("export const mixinPlugins = {");
  const end = src.indexOf("};", start);
  if (start === -1 || end === -1) {
    throw new Error("plugin-utils.js: mixinPlugins object not found");
  }
  src =
    src.slice(0, start) +
    `export const mixinPlugins = {
  estree,
  jsx,
  v8intrinsic,
  placeholders,
  get flow() {
    return _flow.default;
  },
  get typescript() {
    return _typescript.default;
  }
};` +
    src.slice(end + 2);
  writeFileSync(file, src);
}

// ---------------------------------------------------------------------------
// B2: generator-side defer (generators/index.js barrel + nodes.js dispatch)
// ---------------------------------------------------------------------------

function applyGeneratorDefer(tree) {
  const genDir = path.join(tree, "generator/lib");

  // 1. drop ts/flow from the eager barrel so importing it does not pull them in
  const barrel = path.join(genDir, "generators/index.js");
  let b = readFileSync(barrel, "utf8");
  b = b
    .replace(/^export \* from "\.\/typescript\.js";\n/m, "")
    .replace(/^export \* from "\.\/flow\.js";\n/m, "");
  writeFileSync(barrel, b);

  // 2. rebuild nodes.js so ts/flow printers are deferred. CRITICAL: the dispatch
  //    `index` (nodeId) is a stable identity the parens logic depends on
  //    (printer.js hardcodes e.g. `nodeId === 72`, parentNeedsParens switches on
  //    these ids). Indices are assigned by sorting ALL printer keys together, so
  //    we must iterate the full JS∪TS∪Flow key set in the same sorted order as
  //    the eager build — only the TS/Flow *entries* become lazy thunks.
  const nodes = path.join(genDir, "nodes.js");
  writeFileSync(
    nodes,
    `import * as generatorFunctions from "./generators/index.js";
import defer * as _tsGen from "./generators/typescript.js";
import defer * as _flowGen from "./generators/flow.js";
const generatorInfosMap = new Map();
const TS_KEYS = new Set(${JSON.stringify(TS_KEYS)});
const FLOW_KEYS = new Set(${JSON.stringify(FLOW_KEYS)});
const allKeys = [
  ...new Set([...Object.keys(generatorFunctions), ...TS_KEYS, ...FLOW_KEYS]),
].sort();
let index = 0;
for (const key of allKeys) {
  if (key.startsWith("_")) continue;
  let fn;
  if (TS_KEYS.has(key)) {
    fn = function (...a) { return _tsGen[key].apply(this, a); };
  } else if (FLOW_KEYS.has(key)) {
    fn = function (...a) { return _flowGen[key].apply(this, a); };
  } else {
    fn = generatorFunctions[key];
  }
  generatorInfosMap.set(key, [fn, index++, undefined]);
}
export { generatorInfosMap };
`
  );
}

// ---------------------------------------------------------------------------
// run.js (shared by both trees)
// ---------------------------------------------------------------------------

const RUN_JS = `// d8 entry for the Babel parse->generate pipeline.
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
`;

// ---------------------------------------------------------------------------

buildTree("pipeline", { defer: false });
buildTree("pipeline-defer", { defer: true });
console.log("done.");

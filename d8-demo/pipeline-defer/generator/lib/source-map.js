// Stub: source maps are disabled in the d8 pipeline benchmark, so
// generate(ast) never constructs SourceMap. Avoids the @jridgewell/* deps.
export default class SourceMap {
  constructor() {
    throw new Error("SourceMap is stubbed out in the d8 pipeline build");
  }
}

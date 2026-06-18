#!/bin/sh
# Benchmark plain `import` vs `import defer` for the Babel parse->generate pipeline.
#
# Two things are measured:
#   A) STARTUP  — full d8 process wall-clock (V8 init + module load + EVALUATION
#                 + one parse+generate), averaged over K runs. This is where the
#                 import-defer win shows: on plain JS the defer tree never
#                 evaluates the TS/Flow modules, so it should start up faster.
#   B) STEADY   — in-process averaged ms/op once the graph is loaded (run.js's
#                 warm loop). Defer vs eager should match here; for TS the defer
#                 tree's `cold` includes the one-time lazy module evaluation.
#
# Usage:   sh d8-demo/measure.sh
# Env:     D8=/path/to/d8   K=80   N=5000
set -u

D8=${D8:-/Users/caiolima/dev/v8/v8/out/arm64.release/d8}
DIR=$(cd "$(dirname "$0")" && pwd)
K=${K:-80}     # process repetitions for the startup benchmark
N=${N:-5000}   # in-process iterations for the steady-state benchmark
FLAGS="--js-staging"   # same flags for both trees -> only the code differs

JS=${JS:-'const x = a ?? b; class C extends B { #p = 1; get y() { return this.#p; } }'}
TS=${TS:-'class C { private readonly x: number = 1; m<T>(a: T): T { return a; } }'}

now() { perl -MTime::HiRes=time -e 'printf "%.6f\n", time'; }

# bench LABEL  RUNJS  ARGS...
bench() {
  label=$1; runjs=$2; shift 2
  start=$(now)
  i=0
  while [ "$i" -lt "$K" ]; do
    "$D8" $FLAGS --module "$runjs" -- "$@" >/dev/null 2>&1
    i=$((i + 1))
  done
  end=$(now)
  awk -v s="$start" -v e="$end" -v k="$K" -v l="$label" \
    'BEGIN { printf "  %-22s %8.2f ms/run\n", l, (e - s) / k * 1000 }'
}

EAGER="$DIR/pipeline/run.js"
DEFER="$DIR/pipeline-defer/run.js"

echo "d8: $D8"
echo
echo "A) STARTUP — full process wall-clock, avg of K=$K runs (lower = better)"
echo "   plain JS  (defer should win: TS/Flow modules never evaluate)"
bench "eager  plain-JS" "$EAGER" "$JS"
bench "defer  plain-JS" "$DEFER" "$JS"
echo "   TypeScript (defer must still evaluate TS modules -> ~parity)"
bench "eager  TypeScript" "$EAGER" "$TS" ts
bench "defer  TypeScript" "$DEFER" "$TS" ts

echo
echo "B) STEADY-STATE — in-process, N=$N iters (run.js warm loop)"
echo "   eager  plain-JS:    $("$D8" $FLAGS --module "$EAGER" -- "$JS" js "$N" | sed -n 's#^// ##p')"
echo "   defer  plain-JS:    $("$D8" $FLAGS --module "$DEFER" -- "$JS" js "$N" | sed -n 's#^// ##p')"
echo "   eager  TypeScript:  $("$D8" $FLAGS --module "$EAGER" -- "$TS" ts "$N" | sed -n 's#^// ##p')"
echo "   defer  TypeScript:  $("$D8" $FLAGS --module "$DEFER" -- "$TS" ts "$N" | sed -n 's#^// ##p')"

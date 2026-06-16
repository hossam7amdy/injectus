import os from "node:os";
import process from "node:process";

import { bench, group, run, summary } from "mitata";

import * as awilix from "./fixtures/awilix.ts";
import * as injectus from "./fixtures/injectus.ts";
import * as tsyringe from "./fixtures/tsyringe.ts";

const DEPTH = 10;
const WIDTH = 20;

type Lib = {
  cachedContainer(): () => unknown;
  transientContainer(): () => unknown;
  deepChain(depth: number): () => unknown;
  wideGraph(width: number): () => unknown;
};

const libs: Array<[string, Lib]> = [
  ["injectus", injectus],
  ["awilix", awilix],
  ["tsyringe", tsyringe],
];

// Build each lib's resolver once (container construction is excluded from the
// hot loop), smoke-check it returns a wired graph, then bench only resolve().
function benchGroup(title: string, make: (lib: Lib) => () => unknown): void {
  group(title, () => {
    summary(() => {
      for (const [name, lib] of libs) {
        const resolve = make(lib);
        const root = resolve();
        if (root == null) {
          throw new Error(`${name} · ${title}: resolved a nullish root`);
        }
        bench(name, resolve);
      }
    });
  });
}

const groups: Array<[string, (lib: Lib) => () => unknown]> = [
  ["cached singleton resolve", (l) => l.cachedContainer()],
  ["transient resolve (3-node graph)", (l) => l.transientContainer()],
  [`deep chain resolve (depth ${DEPTH})`, (l) => l.deepChain(DEPTH)],
  [`wide graph resolve (fan-out ${WIDTH})`, (l) => l.wideGraph(WIDTH)],
];

function printEnvironment(): void {
  const cpu = os.cpus()[0]?.model.trim() ?? "unknown";
  const ramGiB = (os.totalmem() / 1024 ** 3).toFixed(1);
  console.log("Environment");
  console.log(`  node     ${process.version} (V8 ${process.versions.v8})`);
  console.log(`  os       ${os.type()} ${os.release()} ${process.arch}`);
  console.log(`  cpu      ${cpu} (${os.cpus().length} cores)`);
  console.log(`  memory   ${ramGiB} GiB`);
  console.log(`  date     ${new Date().toISOString()}`);
  console.log("");
}

printEnvironment();
for (const [title, make] of groups) {
  benchGroup(title, make);
}
await run();

import { existsSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const tsxCli = resolve(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs");

function collectSpecs(path) {
  const resolved = resolve(path);
  const result = [];

  for (const entry of readdirSync(resolved)) {
    const full = resolve(resolved, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      result.push(...collectSpecs(full));
    } else if (entry.endsWith(".spec.ts")) {
      result.push(full);
    }
  }

  return result.sort();
}

const roots = process.argv.slice(2);

if (roots.length === 0) {
  console.error("Usage: node scripts/run-specs.mjs <directory> [...directories]");
  process.exit(2);
}

if (!existsSync(tsxCli)) {
  console.error(`The local tsx CLI was not found at ${tsxCli}. Run npm install first.`);
  process.exit(2);
}

const specs = roots.flatMap(collectSpecs);

if (specs.length === 0) {
  console.error("No .spec.ts files were found.");
  process.exit(2);
}

for (const spec of specs) {
  console.log(`\n=== ${relative(repositoryRoot, spec)} ===`);

  const result = spawnSync(process.execPath, [tsxCli, spec], {
    cwd: repositoryRoot,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nAll ${specs.length} spec files passed.`);

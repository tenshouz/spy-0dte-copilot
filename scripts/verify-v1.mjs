import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const npmCli = process.env.npm_execpath;
const tscCli = resolve(repositoryRoot, "node_modules", "typescript", "bin", "tsc");

function run(command, args, label) {
  console.log(`\n=== ${label} ===`);

  const result = spawnSync(command, args, {
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

function output(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

function runNodeScript(scriptPath, args, label) {
  run(process.execPath, [scriptPath, ...args], label);
}

function runNpm(args, label) {
  if (npmCli && existsSync(npmCli)) {
    run(process.execPath, [npmCli, ...args], label);
    return;
  }

  if (process.platform === "win32") {
    throw new Error(
      "npm_execpath is unavailable. Run this verification through `npm run verify:v1`.",
    );
  }

  run("npm", args, label);
}

console.log("=== V1 static release audit ===");

for (const packageFile of [
  "package.json",
  "apps/server/package.json",
  "apps/web/package.json",
  "packages/shared/package.json",
]) {
  const packageJson = JSON.parse(readFileSync(packageFile, "utf8"));

  if (packageJson.version !== "1.1.1") {
    throw new Error(`${packageFile} version must be 1.1.1.`);
  }
}

const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));

for (const packagePath of ["", "apps/server", "apps/web", "packages/shared"]) {
  if (lockfile.packages?.[packagePath]?.version !== "1.1.1") {
    throw new Error(
      `package-lock.json has a non-V1 version for ${packagePath || "root"}.`,
    );
  }
}

for (const file of [
  "docs/V1_RELEASE_RUNBOOK.md",
  "docs/V1_PRD_COMPLIANCE_AUDIT.md",
  "docs/V1_1_1_PROVIDER_ALIGNED_PREMARKET.md",
  "apps/server/src/routes/system-readiness.routes.ts",
  "apps/web/src/app/system/page.tsx",
]) {
  if (!existsSync(file)) {
    throw new Error(`Required V1 artifact is missing: ${file}`);
  }
}

const repositoryFiles = output("git", [
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
])
  .split(/\r?\n/)
  .filter(Boolean);

const forbidden = repositoryFiles.filter((file) =>
  /(^|\/)(\.env|\.env\.(local|development|production|test)|node_modules|\.next|dist|coverage)(\/|$)/.test(
    file,
  ),
);

if (forbidden.length > 0) {
  throw new Error(`Forbidden repository artifacts:\n${forbidden.join("\n")}`);
}

const routeFiles = repositoryFiles.filter(
  (file) => file.startsWith("apps/server/src/routes/") && file.endsWith(".ts"),
);

for (const file of routeFiles) {
  const source = readFileSync(file, "utf8");

  if (/router\.(post|put|patch|delete)\([^\n]*(order|execute|trade-execution)/i.test(source)) {
    throw new Error(`Potential order-execution route found in ${file}.`);
  }
}

const envExample = readFileSync("apps/server/.env.example", "utf8");

if (/DISCORD_WEBHOOK_URL="https?:\/\//.test(envExample)) {
  throw new Error("The env example must not contain a real Discord webhook URL.");
}

if (/SCHWAB_CLIENT_SECRET=".+"/.test(envExample)) {
  throw new Error("The env example must not contain a Schwab client secret.");
}

console.log("Static release audit passed.");

runNodeScript(
  "scripts/run-specs.mjs",
  ["apps/server/src/services"],
  "Complete backend spec suite",
);
runNodeScript(
  "scripts/run-specs.mjs",
  ["apps/web/src/lib"],
  "Complete frontend spec suite",
);
runNpm(["run", "build:server"], "Server production build");

if (!existsSync(tscCli)) {
  throw new Error(`The local TypeScript CLI was not found at ${tscCli}.`);
}

run(
  process.execPath,
  [tscCli, "-p", "apps/web/tsconfig.json", "--noEmit"],
  "Frontend TypeScript",
);
runNpm(["run", "lint"], "Frontend lint");
runNpm(["run", "build:web"], "Frontend production build");
run("git", ["diff", "--check"], "Git whitespace validation");

console.log("\nV1 verification passed.");

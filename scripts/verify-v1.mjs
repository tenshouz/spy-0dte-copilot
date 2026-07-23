import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const npmCli = process.env.npm_execpath;
const tscCli = resolve(repositoryRoot, "node_modules", "typescript", "bin", "tsc");
const expectedVersion = "1.5.4";

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

function output(command, args, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
  });

  if (result.error || result.status !== 0) {
    if (allowFailure) {
      return null;
    }

    console.error(result.error?.message ?? result.stderr);
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

function listFilesRecursively(directory) {
  const ignoredDirectories = new Set([
    ".git",
    ".next",
    "coverage",
    "dist",
    "node_modules",
  ]);
  const results = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const absolutePath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      results.push(...listFilesRecursively(absolutePath));
      continue;
    }

    if (entry.isFile()) {
      results.push(relative(repositoryRoot, absolutePath).replaceAll("\\", "/"));
    }
  }

  return results;
}

function getRepositoryFiles() {
  const gitTopLevel = output("git", ["rev-parse", "--show-toplevel"], true);

  if (gitTopLevel) {
    const files = output("git", [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
    ]);

    return {
      hasGit: true,
      files: files.split(/\r?\n/).filter(Boolean),
    };
  }

  return {
    hasGit: false,
    files: listFilesRecursively(repositoryRoot),
  };
}

console.log("=== V1.5.4 static release audit ===");

for (const packageFile of [
  "package.json",
  "apps/server/package.json",
  "apps/web/package.json",
  "packages/shared/package.json",
]) {
  const packageJson = JSON.parse(readFileSync(packageFile, "utf8"));

  if (packageJson.version !== expectedVersion) {
    throw new Error(`${packageFile} version must be ${expectedVersion}.`);
  }
}

const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));

for (const packagePath of ["", "apps/server", "apps/web", "packages/shared"]) {
  if (lockfile.packages?.[packagePath]?.version !== expectedVersion) {
    throw new Error(
      `package-lock.json has a non-${expectedVersion} version for ${packagePath || "root"}.`,
    );
  }
}

for (const file of [
  "docs/V1_RELEASE_RUNBOOK.md",
  "docs/V1_PRD_COMPLIANCE_AUDIT.md",
  "docs/V1_1_1_PROVIDER_ALIGNED_PREMARKET.md",
  "docs/V1_2_LIVE_MARKET_REFRESH.md",
  "docs/V1_3_DASHBOARD_GUIDE.md",
  "docs/V1_4_EXECUTION_QUALITY.md",
  "docs/V1_4_1_EMPIRICAL_GAMMA_RESEARCH.md",
  "docs/V1_5_POINT_IN_TIME_BACKTESTING.md",
  "docs/V1_5_1_HISTORICAL_REPLAY_RECOVERY.md",
  "docs/V1_5_2_DISCORD_ALERT_HARDENING.md",
  "docs/V1_5_3_DISCORD_ALERT_CONTRACT_HOTFIX.md",
  "docs/V1_5_4_TRIGGER_LIFECYCLE_RETEST_RECOVERY.md",
  "RELEASE_NOTES_v1.5.3.md",
  "IMPLEMENTATION_SUMMARY_v1.5.3.md",
  "VERIFICATION_REPORT_v1.5.3.md",
  "README_APPLY_v1.5.3.txt",
  "CHANGED_FILES_v1.5.3.txt",
  "SOURCE_MANIFEST_SHA256_v1.5.3.txt",
  "RELEASE_NOTES_v1.5.4.md",
  "IMPLEMENTATION_SUMMARY_v1.5.4.md",
  "VERIFICATION_REPORT_v1.5.4.md",
  "README_APPLY_v1.5.4.txt",
  "CHANGED_FILES_v1.5.4.txt",
  "SOURCE_MANIFEST_SHA256_v1.5.4.txt",
  "STRONGEST_NEXT_VERSION.md",
  "apps/server/prisma/migrations/20260721040000_add_point_in_time_backtesting/migration.sql",
  "packages/shared/src/backtest-schemas.ts",
  "apps/server/src/services/point-in-time-backtest.logic.ts",
  "apps/server/src/services/point-in-time-backtest.service.ts",
  "apps/server/src/services/point-in-time-backtest.spec.ts",
  "apps/server/src/services/historical-underlying-backtest.logic.ts",
  "apps/server/src/services/historical-underlying-backtest.service.ts",
  "apps/server/src/services/historical-underlying-contract.logic.ts",
  "apps/server/src/services/historical-underlying-backtest.spec.ts",
  "apps/server/src/routes/point-in-time-backtest.routes.ts",
  "apps/server/src/routes/point-in-time-backtest.routes.spec.ts",
  "apps/web/src/app/backtest/page.tsx",
  "apps/web/src/hooks/use-point-in-time-backtest.ts",
  "apps/web/src/lib/point-in-time-backtest-view.ts",
  "apps/web/src/lib/point-in-time-backtest-view.spec.ts",
]) {
  if (!existsSync(file)) {
    throw new Error(`Required V1.5.4 artifact is missing: ${file}`);
  }
}

const { files: repositoryFiles, hasGit } = getRepositoryFiles();

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

if (statSync("apps/server/prisma/schema.prisma").size === 0) {
  throw new Error("Prisma schema is empty.");
}

console.log("Static release audit passed.");

runNodeScript(
  "scripts/run-specs.mjs",
  ["apps/server/src/services"],
  "Complete backend service spec suite",
);
run(
  process.execPath,
  [resolve(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs"), "apps/server/src/routes/gamma-research.routes.spec.ts"],
  "Gamma research route spec",
);
run(
  process.execPath,
  [resolve(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs"), "apps/server/src/routes/point-in-time-backtest.routes.spec.ts"],
  "Point-in-time backtest route spec",
);
runNodeScript(
  "scripts/run-specs.mjs",
  ["apps/web/src/lib"],
  "Complete frontend spec suite",
);

if (!existsSync(tscCli)) {
  throw new Error(`The local TypeScript CLI was not found at ${tscCli}.`);
}

run(
  process.execPath,
  [tscCli, "-p", "packages/shared/tsconfig.json", "--noEmit"],
  "Shared TypeScript",
);
runNpm(["run", "build:server"], "Server production build");
run(
  process.execPath,
  [tscCli, "-p", "apps/web/tsconfig.json", "--noEmit"],
  "Frontend TypeScript",
);
runNpm(["run", "lint"], "Frontend lint");
runNpm(["run", "build:web"], "Frontend production build");

if (hasGit) {
  run("git", ["diff", "--check"], "Git whitespace validation");
} else {
  console.log("\nGit metadata is not present; whitespace diff validation was skipped.");
}

console.log("\nV1.5.4 verification passed.");

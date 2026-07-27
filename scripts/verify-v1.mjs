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
const expectedVersion = "1.9.1";

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

console.log("=== V1.9.1 static release audit ===");

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
  "README.md",
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
  "docs/V1_6_TRADING_POLICY_RISK_POSITION.md",
  "docs/V1_7_MODULAR_SETUP_REGISTRY.md",
  "docs/V1_8_OPPORTUNITY_ALERT_EXECUTION.md",
  "docs/V1_9_COMPLETE_TRADING_FRAMEWORK.md",
  "docs/V1_9_PRODUCT_ALIGNMENT.md",
  "docs/V1_9_1_CONTRACT_SELECTION_PLANNED_RISK.md",
  "apps/server/prisma/migrations/20260721040000_add_point_in_time_backtesting/migration.sql",
  "apps/server/prisma/migrations/20260723133000_add_complete_trading_framework/migration.sql",
  "packages/shared/src/release-metadata.ts",
  "packages/shared/src/backtest-schemas.ts",
  "packages/shared/src/trading-framework-schemas.ts",
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
  "apps/server/src/services/trading-policy.logic.ts",
  "apps/server/src/services/trading-policy.spec.ts",
  "apps/server/src/services/setup-registry.logic.ts",
  "apps/server/src/services/setup-registry.spec.ts",
  "apps/server/src/services/trading-opportunity.logic.ts",
  "apps/server/src/services/trading-opportunity.spec.ts",
  "apps/server/src/services/exit-policy-research.logic.ts",
  "apps/server/src/services/exit-policy-research.spec.ts",
  "apps/server/src/services/trading-workspace.repository.ts",
  "apps/server/src/services/trading-workspace.service.ts",
  "apps/server/src/services/trading-workspace-automation.service.ts",
  "apps/server/src/services/trading-framework-structure.spec.ts",
  "apps/server/src/index.ts",
  "apps/server/src/services/system-readiness.logic.ts",
  "apps/server/src/services/system-readiness.service.ts",
  "apps/server/src/services/system-readiness.spec.ts",
  "apps/server/src/routes/trading-workspace.routes.ts",
  "apps/server/src/routes/trading-workspace.routes.spec.ts",
  "apps/web/src/app/workspace/page.tsx",
  "apps/web/src/hooks/use-trading-workspace.ts",
  "apps/web/src/app/dashboard/page.tsx",
  "apps/web/src/app/trade-plan/page.tsx",
  "apps/web/src/app/alerts/page.tsx",
  "apps/web/src/app/settings/page.tsx",
  "apps/web/src/app/guide/page.tsx",
  "apps/web/src/app/system/page.tsx",
  "apps/web/src/components/system/system-readiness-panel.tsx",
  "apps/web/src/components/guide/dashboard-guide.tsx",
  "apps/web/src/lib/dashboard-guide-content.ts",
]) {
  if (!existsSync(file)) {
    throw new Error(`Required V1.9.1 artifact is missing: ${file}`);
  }
}

function requireText(file, fragments) {
  const source = readFileSync(file, "utf8");
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      throw new Error(`${file} is missing required current-release content: ${fragment}`);
    }
  }
  return source;
}

const releaseMetadataSource = requireText("packages/shared/src/release-metadata.ts", [
  'SPY_COPILOT_RELEASE_VERSION = "1.9.1"',
  'SPY_COPILOT_RELEASE_LABEL = "V1.9.1"',
  'SPY_COPILOT_RELEASE_NAME = "Complete Trading Framework"',
]);
void releaseMetadataSource;

requireText("packages/shared/src/index.ts", ['export * from "./release-metadata"']);

const sharedSchemasSource = requireText("packages/shared/src/schemas.ts", [
  'import { SPY_COPILOT_RELEASE_VERSION } from "./release-metadata"',
  'releaseVersion: z.literal(SPY_COPILOT_RELEASE_VERSION)',
  '"TRADING_POLICY"',
  '"TRADING_FRAMEWORK_PERSISTENCE"',
  '"SETUP_REGISTRY"',
  '"TRADING_WORKSPACE_RUNTIME"',
  '"TRADING_WORKSPACE"',
  'checks: z.array(SystemReadinessCheckSchema).length(13)',
  'totalComponents: z.literal(5)',
  'noReadyAlertReconciliation: z.literal(true)',
  'noPositionLifecycleMutation: z.literal(true)',
]);
void sharedSchemasSource;

const currentReleaseSurfaces = [
  "README.md",
  "apps/web/README.md",
  "apps/web/src/components/guide/dashboard-guide.tsx",
  "apps/web/src/lib/dashboard-guide-content.ts",
  "apps/web/src/app/dashboard/page.tsx",
  "apps/web/src/app/trade-plan/page.tsx",
  "apps/web/src/app/alerts/page.tsx",
  "apps/web/src/app/settings/page.tsx",
  "apps/web/src/app/guide/page.tsx",
  "apps/web/src/app/system/page.tsx",
  "apps/web/src/components/system/system-readiness-panel.tsx",
  "apps/server/src/index.ts",
  "apps/server/src/services/system-readiness.logic.ts",
  "docs/V1_RELEASE_RUNBOOK.md",
  "docs/V1_PRD_COMPLIANCE_AUDIT.md",
  "docs/V1_3_DASHBOARD_GUIDE.md",
  "docs/V1_9_PRODUCT_ALIGNMENT.md",
  "docs/V1_9_1_CONTRACT_SELECTION_PLANNED_RISK.md",
];

const staleCurrentReleasePatterns = [
  /Release 1\.5\.0/i,
  /V1 System Readiness/i,
  /Final V1/i,
  /minimum(?:\s+underlying)?\s+(?:reward[- ]to[- ]risk|R:R)[^\n]{0,40}2(?:\.0)?:1/i,
  /at least\s+2(?:\.0)?:1/i,
  /releaseVersion\s*[:=][^\n]{0,20}["']1\.5\.0["']/i,
];

for (const file of currentReleaseSurfaces) {
  const source = readFileSync(file, "utf8");
  for (const pattern of staleCurrentReleasePatterns) {
    if (pattern.test(source)) {
      throw new Error(`Stale current-release content remains in ${file}: ${pattern}`);
    }
  }
}

requireText("apps/web/src/lib/dashboard-guide-content.ts", [
  'href: "/workspace"',
  "Minimum underlying and option-premium R:R",
  "1.5:1",
  "2.0:1 or better",
  "bounded CONTRACT_V3",
  "Planned structural loss",
  "Premium-loss backstop",
  "60 seconds",
  "Shadow mode",
  "Target 2",
]);


requireText("apps/server/src/index.ts", [
  "SPY_COPILOT_RELEASE_VERSION",
  "releaseVersion: SPY_COPILOT_RELEASE_VERSION",
]);

requireText("apps/server/src/services/system-readiness.logic.ts", [
  "SPY_COPILOT_RELEASE_VERSION",
  'id: "TRADING_POLICY"',
  'id: "TRADING_FRAMEWORK_PERSISTENCE"',
  'id: "SETUP_REGISTRY"',
  'id: "TRADING_WORKSPACE_RUNTIME"',
  'id: "TRADING_WORKSPACE"',
]);

requireText("apps/web/src/components/system/system-readiness-panel.tsx", [
  "SPY_COPILOT_RELEASE_LABEL",
  "five-component",
  "Trading Workspace",
]);

requireText("apps/web/src/app/alerts/page.tsx", [
  "Source Trade Plan transition monitoring",
  "V1.9 READY alerts",
  "Trading Workspace",
]);

requireText("apps/web/src/app/trade-plan/page.tsx", [
  "CONTRACT_V3 evaluates only the effective ATM strike",
  "planned structural-risk sizing",
  "manual $50 option-loss backstop",
  "Trading Workspace applies policy",
]);

const { files: repositoryFiles, hasGit } = getRepositoryFiles();

const forbidden = repositoryFiles.filter((file) =>
  /(^|\/)(\.env|\.env\.(local|development|production|test)|node_modules|\.next|dist|coverage)(\/|$)/.test(
    file,
  ),
);

const removablePackagingArtifacts = [
  "payload",
  "text-md's",
  "Install_V1_6_to_V1_9.ps1",
  "Install_V1_9_0_TypeScript_Compile_Hotfix.ps1",
  "Verify_V1_9_0.ps1",
  "SANITIZATION_REPORT.txt",
  "SOURCE_MANIFEST.sha256",
].filter((entry) => existsSync(entry));

if (removablePackagingArtifacts.length > 0) {
  console.warn(
    `Optional copied packaging artifacts remain in the project root and are not runtime dependencies:
${removablePackagingArtifacts.join("\n")}`,
  );
}

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

const tradingPolicySource = readFileSync(
  "apps/server/src/services/trading-policy.logic.ts",
  "utf8",
);
for (const requiredPolicyFragment of [
  "paperEquivalentAccountDollars: 1000",
  "maximumContractPremiumDollars: 150",
  "maximumPlannedStructuralLossDollars: 50",
  "maximumDailyLossDollars: 150",
  "maximumTradesPerDay: 3",
  "stopAfterConsecutiveLosses: 2",
  "maximumConcurrentPositions: 1",
  "maximumContractsInitially: 1",
  "maximumAttemptsPerSetupDirectionLevel: 2",
  "readyAlertTtlSeconds: 60",
]) {
  if (!tradingPolicySource.includes(requiredPolicyFragment)) {
    throw new Error(`Locked TRADING_POLICY_V1 fragment is missing: ${requiredPolicyFragment}`);
  }
}

const migrationSource = readFileSync(
  "apps/server/prisma/migrations/20260723133000_add_complete_trading_framework/migration.sql",
  "utf8",
);
const constraintNames = [...migrationSource.matchAll(/ADD CONSTRAINT "([^"]+)"/g)].map(
  (match) => match[1],
);
if (new Set(constraintNames).size !== constraintNames.length) {
  throw new Error("The V1.9 migration contains a duplicate constraint name.");
}

console.log("Static release audit passed.");

if (process.argv.includes("--static-only")) {
  console.log("Static-only V1.9.1 verification passed.");
  process.exit(0);
}

runNpm(["run", "db:validate"], "Prisma schema validation");
runNpm(["run", "db:generate"], "Prisma client generation");

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
run(
  process.execPath,
  [resolve(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs"), "apps/server/src/routes/trading-workspace.routes.spec.ts"],
  "Trading workspace route spec",
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

console.log("\nV1.9.1 verification passed.");

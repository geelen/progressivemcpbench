#!/usr/bin/env node
import { spawn } from "child_process";
import { parseArgs } from "util";
import { MODELS, STRATEGIES, EPOCHS, REMOTE_STRATEGY, REMOTE_RUN_CONFIGS } from "./benchConfig";

const DEFAULT_OPENBENCH_DIR = process.env.OPENBENCH_DIR || "../openbench";

function runCommand(cmd: string, cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    console.log(`> ${cmd}`);
    const proc = spawn(cmd, [], {
      stdio: "inherit",
      shell: true,
      cwd,
    });

    proc.on("close", (code) => {
      resolve(code || 0);
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

interface RunOptions {
  models?: string[];
  strategies?: string[];
  epochs?: number;
  dryRun?: boolean;
  openbenchDir: string;
  includeRemote?: boolean;
  remoteOnly?: boolean;
}

async function runFullBench(options: RunOptions): Promise<void> {
  const {
    models = MODELS.map((m) => m.id),
    strategies = STRATEGIES.map((s) => s.id),
    epochs = EPOCHS,
    dryRun = false,
    openbenchDir,
    includeRemote = false,
    remoteOnly = false,
  } = options;

  const shouldRunRemote = includeRemote || remoteOnly;
  const remoteConfigs = shouldRunRemote
    ? REMOTE_RUN_CONFIGS.filter((c) => models.includes(c.modelId))
    : [];

  console.log("=== Progressive MCP Bench Full Run ===");
  console.log(`OpenBench dir: ${openbenchDir}`);
  if (!remoteOnly) {
    console.log(`Models: ${models.length}`);
    console.log(`Strategies: ${strategies.length}`);
    console.log(`Total combinations: ${models.length * strategies.length}`);
  }
  console.log(`Epochs: ${epochs}`);
  if (remoteConfigs.length > 0) {
    console.log(`Remote runs: ${remoteConfigs.length}`);
  }
  console.log("");

  if (!remoteOnly) {
    for (const model of models) {
      console.log(`\n===== MODEL: ${model} =====`);

      for (const strategy of strategies) {
        console.log(`--- Strategy: ${strategy} ---`);

        const cmd = `uv run bench eval progressivemcpbench --model "${model}" --alpha --epochs ${epochs} --epochs-reducer mean -T strategy=${strategy}`;

        if (dryRun) {
          console.log(`[DRY RUN] ${cmd}`);
        } else {
          const exitCode = await runCommand(cmd, openbenchDir);
          if (exitCode !== 0) {
            console.error(`Warning: bench exited with code ${exitCode}`);
          }
        }
      }
    }
  }

  if (remoteConfigs.length > 0) {
    console.log("\n===== REMOTE RUNS =====");
    for (const config of remoteConfigs) {
      const toolDiscoveryFlag = config.toolDiscovery
        ? ` -T tool-discovery=${config.toolDiscovery}`
        : "";
      console.log(`--- ${config.displayName} ---`);

      const cmd = `uv run bench eval progressivemcpbench --model "${config.modelId}" --alpha --epochs ${epochs} --epochs-reducer mean -T strategy=${REMOTE_STRATEGY}${toolDiscoveryFlag}`;

      if (dryRun) {
        console.log(`[DRY RUN] ${cmd}`);
      } else {
        const exitCode = await runCommand(cmd, openbenchDir);
        if (exitCode !== 0) {
          console.error(`Warning: bench exited with code ${exitCode}`);
        }
      }
    }
  }

  console.log("\n=== Full run complete ===");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      model: { type: "string", short: "m", multiple: true },
      strategy: { type: "string", short: "s", multiple: true },
      epochs: { type: "string", short: "e" },
      openbench: { type: "string", short: "o" },
      "dry-run": { type: "boolean", default: false },
      remote: { type: "boolean", short: "r", default: false },
      "remote-only": { type: "boolean", default: false },
      list: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`
Usage: bun run runFullBench.ts [options]

Options:
  -m, --model <id>       Run only specific model(s) (can be repeated)
  -s, --strategy <id>    Run only specific strategy(s) (can be repeated)
  -e, --epochs <n>       Number of epochs (default: ${EPOCHS})
  -o, --openbench <dir>  Path to openbench directory (default: ../openbench or OPENBENCH_DIR)
  --dry-run              Print commands without executing
  -r, --remote           Include server-side MCP runs (groq/anthropic only)
  --remote-only          Run ONLY server-side MCP runs (skip local strategies)
  --list                 List all configured models and strategies
  -h, --help             Show this help message

Environment:
  OPENBENCH_DIR          Path to openbench directory
  OPENAI_API_KEY         Required for running benchmarks
`);
    process.exit(0);
  }

  if (values.list) {
    console.log("Models:");
    for (const model of MODELS) {
      console.log(`  ${model.id} (${model.displayName})`);
    }
    console.log("\nStrategies:");
    for (const strategy of STRATEGIES) {
      console.log(`  ${strategy.id} (${strategy.displayName})`);
    }
    console.log("\nRemote runs (server-side MCP):");
    for (const config of REMOTE_RUN_CONFIGS) {
      const discoveryStr = config.toolDiscovery ? `tool-discovery=${config.toolDiscovery}` : "(default)";
      console.log(`  ${config.modelId} ${discoveryStr}`);
    }
    process.exit(0);
  }

  if (!process.env.OPENAI_API_KEY && !values["dry-run"]) {
    console.error("Error: OPENAI_API_KEY environment variable must be set");
    process.exit(1);
  }

  const openbenchDir = values.openbench || DEFAULT_OPENBENCH_DIR;
  const models = values.model?.length ? values.model : undefined;
  const strategies = values.strategy?.length ? values.strategy : undefined;
  const epochs = values.epochs ? parseInt(values.epochs, 10) : undefined;

  await runFullBench({
    models,
    strategies,
    epochs,
    dryRun: values["dry-run"],
    openbenchDir,
    includeRemote: values.remote,
    remoteOnly: values["remote-only"],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

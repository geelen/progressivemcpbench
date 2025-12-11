#!/usr/bin/env node
import { spawn } from "child_process";
import { parseArgs } from "util";
import { MODELS, STRATEGIES, EPOCHS } from "./benchConfig";

function runCommand(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    console.log(`> ${cmd} ${args.join(" ")}`);
    const proc = spawn(cmd, args, {
      stdio: "inherit",
      shell: true,
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
}

async function runFullBench(options: RunOptions): Promise<void> {
  const {
    models = MODELS.map((m) => m.id),
    strategies = STRATEGIES.map((s) => s.id),
    epochs = EPOCHS,
    dryRun = false,
  } = options;

  console.log("=== Progressive MCP Bench Full Run ===");
  console.log(`Models: ${models.length}`);
  console.log(`Strategies: ${strategies.length}`);
  console.log(`Epochs: ${epochs}`);
  console.log(`Total combinations: ${models.length * strategies.length}`);
  console.log("");

  for (const model of models) {
    console.log(`\n===== MODEL: ${model} =====`);

    for (const strategy of strategies) {
      console.log(`--- Strategy: ${strategy} ---`);

      const args = [
        "eval",
        "progressivemcpbench",
        "--model",
        model,
        "--alpha",
        "--epochs",
        epochs.toString(),
        "--epochs-reducer",
        "mean",
        "-T",
        `strategy=${strategy}`,
      ];

      if (dryRun) {
        console.log(`[DRY RUN] bench ${args.join(" ")}`);
      } else {
        const exitCode = await runCommand("bench", args);
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
      "dry-run": { type: "boolean", default: false },
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
  --dry-run              Print commands without executing
  --list                 List all configured models and strategies
  -h, --help             Show this help message

Environment:
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
    process.exit(0);
  }

  if (!process.env.OPENAI_API_KEY && !values["dry-run"]) {
    console.error("Error: OPENAI_API_KEY environment variable must be set");
    process.exit(1);
  }

  const models = values.model?.length ? values.model : undefined;
  const strategies = values.strategy?.length ? values.strategy : undefined;
  const epochs = values.epochs ? parseInt(values.epochs, 10) : undefined;

  await runFullBench({
    models,
    strategies,
    epochs,
    dryRun: values["dry-run"],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

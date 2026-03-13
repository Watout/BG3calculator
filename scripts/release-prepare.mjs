import { access } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  getGitHubToken,
  runCommand,
  runGitHubWorkflowDispatch
} from "./github-workflow-dispatch.mjs";
import { parseReleaseTag } from "./release-preflight.mjs";
import {
  runReleasePrepareLocal
} from "./release-prepare-local.mjs";

export const PREPARE_RELEASE_WORKFLOW = "prepare-release.yml";
export const DEFAULT_RELEASE_BRANCH = "main";

export class ReleasePrepareError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleasePrepareError";
  }
}

export function parseCliArgs(argv) {
  const options = {
    autoCommit: false,
    commitMessage: null,
    dryRun: false,
    help: false,
    mode: "auto",
    timeoutMinutes: 20,
    wait: false,
    tag: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--") {
      continue;
    }

    if (value === "--help" || value === "-h") {
      options.help = true;
      continue;
    }

    if (value === "--tag") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePrepareError("Missing value for --tag.");
      }
      options.tag = nextValue;
      index += 1;
      continue;
    }

    if (value === "--mode") {
      const nextValue = argv[index + 1];
      if (!nextValue || !["auto", "dispatch", "manual"].includes(nextValue)) {
        throw new ReleasePrepareError('--mode must be one of "auto", "dispatch", or "manual".');
      }
      options.mode = nextValue;
      index += 1;
      continue;
    }

    if (value === "--auto-commit") {
      options.autoCommit = true;
      continue;
    }

    if (value === "--commit-message") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePrepareError("Missing value for --commit-message.");
      }
      options.commitMessage = nextValue;
      index += 1;
      continue;
    }

    if (value === "--wait") {
      options.wait = true;
      continue;
    }

    if (value === "--timeout-minutes") {
      const nextValue = argv[index + 1];
      const parsed = Number(nextValue);
      if (!nextValue || !Number.isInteger(parsed) || parsed <= 0) {
        throw new ReleasePrepareError("--timeout-minutes must be a positive integer.");
      }
      options.timeoutMinutes = parsed;
      index += 1;
      continue;
    }

    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    throw new ReleasePrepareError(`Unknown argument: ${value}`);
  }

  return options;
}

export function printHelp() {
  return [
    "Usage: pnpm release:prepare -- --tag <tag> [options]",
    "",
    "Options:",
    "  --tag <tag>                Release tag/version to prepare. Required.",
    '  --mode <auto|dispatch|manual>  Auto-select workflow dispatch or local fallback. Defaults to auto.',
    "  --auto-commit             Stage and commit all current changes before pushing/dispatching.",
    "  --commit-message <text>    Commit message used with --auto-commit.",
    "  --wait                     In dispatch mode, wait for prepare-release.yml to finish successfully.",
    "  --timeout-minutes <n>      Wait timeout in minutes. Defaults to 20.",
    "  --dry-run                  Print the selected path without mutating git state or dispatching workflows.",
    "  --help, -h                 Show this help text."
  ].join("\n");
}

export function selectReleasePath({ hasDispatchWorkflow, mode, token }) {
  if (mode === "dispatch") {
    return "dispatch";
  }

  if (mode === "manual") {
    return "manual";
  }

  return hasDispatchWorkflow && Boolean(token) ? "dispatch" : "manual";
}

export function validateTagCollisionState({ localTagExists, path, remoteTagExists }) {
  if (remoteTagExists) {
    throw new ReleasePrepareError(
      "Remote tag already exists. Bump to a brand new release version before continuing."
    );
  }

  if (path === "manual" && localTagExists) {
    throw new ReleasePrepareError(
      "Local tag already exists. Delete the local tag or bump to a new release version before running the manual path."
    );
  }
}

export async function workflowExists(cwd, workflowFile) {
  try {
    await access(`${cwd}/.github/workflows/${workflowFile}`);
    return true;
  } catch {
    return false;
  }
}

export async function getTagCollisionState(commandRunner, cwd, tag) {
  const localTagExists =
    (await commandRunner("git", ["tag", "--list", tag], { cwd })).stdout.trim().length > 0;
  const remoteQuery = await commandRunner(
    "git",
    ["ls-remote", "--tags", "origin", `refs/tags/${tag}`],
    { allowFailure: true, cwd }
  );

  if (remoteQuery.exitCode !== 0) {
    throw new ReleasePrepareError(
      `Unable to query remote tag ${tag}: ${remoteQuery.stderr.trim() || remoteQuery.stdout.trim()}`
    );
  }

  return {
    localTagExists,
    remoteTagExists: remoteQuery.stdout.trim().length > 0
  };
}

export async function runReleasePrepare({
  argv = process.argv.slice(2),
  commandRunner,
  cwd = process.cwd(),
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  sleep
} = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    return { exitCode: 0, stdout: `${printHelp()}\n` };
  }

  if (!options.tag) {
    throw new ReleasePrepareError("Missing required --tag argument.");
  }

  parseReleaseTag(options.tag);
  const hasDispatchWorkflow = await workflowExists(cwd, PREPARE_RELEASE_WORKFLOW);
  const selectedPath = selectReleasePath({
    hasDispatchWorkflow,
    mode: options.mode,
    token: getGitHubToken(env)
  });
  const collisionState = await getTagCollisionState(
    commandRunner ?? runCommand,
    cwd,
    options.tag
  );

  validateTagCollisionState({
    ...collisionState,
    path: selectedPath
  });

  if (selectedPath === "dispatch") {
    if (!hasDispatchWorkflow) {
      throw new ReleasePrepareError(
        `${PREPARE_RELEASE_WORKFLOW} is missing. Dispatch mode is unavailable in this repository.`
      );
    }

    const dispatchArgs = [
      "--workflow",
      PREPARE_RELEASE_WORKFLOW,
      "--ref",
      DEFAULT_RELEASE_BRANCH,
      "--input",
      `tag=${options.tag}`
    ];

    if (options.autoCommit) {
      dispatchArgs.push("--auto-commit");
    }
    if (options.commitMessage) {
      dispatchArgs.push("--commit-message", options.commitMessage);
    }
    if (options.wait) {
      dispatchArgs.push("--wait", "--require-success");
    }
    if (options.timeoutMinutes !== 20) {
      dispatchArgs.push("--timeout-minutes", String(options.timeoutMinutes));
    }
    if (options.dryRun) {
      dispatchArgs.push("--dry-run");
    }

    const dispatchResult = await runGitHubWorkflowDispatch({
      argv: dispatchArgs,
      commandRunner,
      cwd,
      env,
      fetchImpl,
      now,
      sleep
    });
    const localTagWarning = collisionState.localTagExists
      ? `Local tag ${options.tag} already exists, but dispatch mode only blocks remote tag reuse.`
      : null;

    return {
      exitCode: dispatchResult.exitCode,
      stdout:
        [
          `Selected path: dispatch`,
          `Tag: ${options.tag}`,
          localTagWarning,
          dispatchResult.stdout.trimEnd(),
          "prepare-release.yml will create and push the new tag, then release-desktop.yml will build from that tag."
        ]
          .filter(Boolean)
          .join("\n") + "\n"
    };
  }

  const manualResult = await runReleasePrepareLocal({
    argv: [
      "--tag",
      options.tag,
      ...(options.autoCommit ? ["--auto-commit"] : []),
      ...(options.commitMessage ? ["--commit-message", options.commitMessage] : []),
      ...(options.dryRun ? ["--dry-run"] : [])
    ],
    commandRunner,
    cwd
  });

  return {
    exitCode: manualResult.exitCode,
    stdout: `Selected path: manual\nTag: ${options.tag}\n${manualResult.stdout}`
  };
}

async function main() {
  try {
    const result = await runReleasePrepare();
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    process.exitCode = result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

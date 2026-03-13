import { access } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  getGitHubToken,
  parseGitHubRepository,
  runCommand,
  runGitHubWorkflowDispatch
} from "./github-workflow-dispatch.mjs";
import { parseReleaseTag } from "./release-preflight.mjs";

export const CREATE_RELEASE_TAG_WORKFLOW = "create-release-tag.yml";
export const DEFAULT_RELEASE_BRANCH = "main";

export class ReleasePrepareError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleasePrepareError";
  }
}

export function parseCliArgs(argv) {
  const options = {
    dryRun: false,
    help: false,
    tag: null,
    timeoutMinutes: 20,
    wait: false
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
    "  --tag <tag>                Release tag/version already merged into main. Required.",
    "  --wait                     Wait for create-release-tag.yml to finish successfully.",
    "  --timeout-minutes <n>      Wait timeout in minutes. Defaults to 20.",
    "  --dry-run                  Validate local/remote state and print the selected dispatch payload.",
    "  --help, -h                 Show this help text."
  ].join("\n");
}

export function validateTagCollisionState({ remoteTagExists }) {
  if (remoteTagExists) {
    throw new ReleasePrepareError(
      "Remote tag already exists. Bump to a brand new release version before continuing."
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

  if (!(await workflowExists(cwd, CREATE_RELEASE_TAG_WORKFLOW))) {
    throw new ReleasePrepareError(
      `${CREATE_RELEASE_TAG_WORKFLOW} is missing. release:prepare requires the remote release-tag workflow.`
    );
  }

  const remoteUrlResult = await (commandRunner ?? runCommand)(
    "git",
    ["remote", "get-url", "origin"],
    { allowFailure: true, cwd }
  );
  let repositorySlug = env.GITHUB_REPOSITORY ?? env.BG3DC_GITHUB_REPOSITORY ?? null;

  if (!repositorySlug && remoteUrlResult.exitCode === 0) {
    try {
      repositorySlug = parseGitHubRepository(remoteUrlResult.stdout.trim());
    } catch {
      repositorySlug = null;
    }
  }

  getGitHubToken(env, { repositorySlug });
  const collisionState = await getTagCollisionState(commandRunner ?? runCommand, cwd, options.tag);
  validateTagCollisionState(collisionState);

  const dispatchArgs = [
    "--workflow",
    CREATE_RELEASE_TAG_WORKFLOW,
    "--ref",
    DEFAULT_RELEASE_BRANCH,
    "--input",
    `tag=${options.tag}`,
    "--no-push"
  ];

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

  return {
    exitCode: dispatchResult.exitCode,
    stdout:
      [
        "Release entry: remote-tag-workflow",
        `Tag: ${options.tag}`,
        dispatchResult.stdout.trimEnd(),
        `${CREATE_RELEASE_TAG_WORKFLOW} will create and push the new tag from origin/main, then release-desktop.yml will build from that tag.`
      ]
        .filter(Boolean)
        .join("\n") + "\n"
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

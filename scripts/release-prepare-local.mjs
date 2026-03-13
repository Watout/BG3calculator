import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  gitStdout,
  runCommand
} from "./github-workflow-dispatch.mjs";
import { parseReleaseTag, runReleasePreflight } from "./release-preflight.mjs";
import { runReleaseSyncVersion } from "./release-sync-version.mjs";

export const DEFAULT_REMOTE = "origin";
export const DEFAULT_BRANCH = "main";
export const VERSION_FILES = [
  "package.json",
  "apps/desktop-tauri/package.json",
  "apps/desktop-tauri/src-tauri/tauri.conf.json",
  "apps/desktop-tauri/src-tauri/Cargo.toml"
];

export class ReleasePrepareLocalError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleasePrepareLocalError";
  }
}

export function parseCliArgs(argv) {
  const options = {
    autoCommit: false,
    branch: DEFAULT_BRANCH,
    commitMessage: null,
    dryRun: false,
    help: false,
    remote: DEFAULT_REMOTE,
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

    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (value === "--auto-commit") {
      options.autoCommit = true;
      continue;
    }

    if (value === "--commit-message") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePrepareLocalError("Missing value for --commit-message.");
      }
      options.commitMessage = nextValue;
      index += 1;
      continue;
    }

    if (value === "--tag") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePrepareLocalError("Missing value for --tag.");
      }
      options.tag = nextValue;
      index += 1;
      continue;
    }

    if (value === "--branch") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePrepareLocalError("Missing value for --branch.");
      }
      options.branch = nextValue;
      index += 1;
      continue;
    }

    if (value === "--remote") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePrepareLocalError("Missing value for --remote.");
      }
      options.remote = nextValue;
      index += 1;
      continue;
    }

    throw new ReleasePrepareLocalError(`Unknown argument: ${value}`);
  }

  return options;
}

export function printHelp() {
  return [
    "Usage: pnpm release:prepare-local -- --tag <tag> [options]",
    "",
    "Options:",
    "  --tag <tag>                Release tag/version to publish locally. Required.",
    `  --branch <branch>          Branch to push before tagging. Defaults to ${DEFAULT_BRANCH}.`,
    `  --remote <name>            Git remote to push to. Defaults to ${DEFAULT_REMOTE}.`,
    "  --auto-commit             Stage and commit all current changes before release preparation.",
    "  --commit-message <text>    Commit message used with --auto-commit.",
    "  --dry-run                  Validate and print the planned actions without mutating git state.",
    "  --help, -h                 Show this help text."
  ].join("\n");
}

export function formatSummary({
  branch,
  committedVersionFiles,
  createdPrepCommit,
  dryRun,
  headSha,
  remote,
  tag
}) {
  const lines = [
    `${dryRun ? "Validated" : "Prepared"} local release ${tag}.`,
    `Branch: ${branch}`,
    `Remote: ${remote}`,
    `Head SHA: ${headSha}`
  ];

  if (!dryRun) {
    lines.push(`Auto-commit before release: ${createdPrepCommit ? "yes" : "not needed"}`);
    lines.push(
      `Release version commit: ${committedVersionFiles ? "created" : "not needed"}`
    );
    lines.push(`Triggered actions: push ${branch} -> ci.yml, push tag ${tag} -> release-desktop.yml`);
  }

  return `${lines.join("\n")}\n`;
}

export async function ensureCleanOrAutoCommit({
  autoCommit,
  commandRunner,
  commitMessage,
  cwd
}) {
  const status = await gitStdout(commandRunner, ["status", "--porcelain"], { cwd });
  if (status.trim().length === 0) {
    return false;
  }

  if (!autoCommit) {
    throw new ReleasePrepareLocalError(
      "Working tree must be clean before running release:prepare-local, or pass --auto-commit."
    );
  }

  await commandRunner("git", ["add", "-A"], { cwd });
  await commandRunner(
    "git",
    ["commit", "-m", commitMessage ?? "chore: local cicd handoff before release"],
    { cwd }
  );
  return true;
}

export async function ensureCurrentBranch(commandRunner, branch, cwd) {
  const currentBranch = await gitStdout(commandRunner, ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd
  });

  if (currentBranch !== branch) {
    throw new ReleasePrepareLocalError(
      `Check out branch "${branch}" before running release:prepare-local. Current branch: ${currentBranch}.`
    );
  }
}

export async function ensureTagAvailable(commandRunner, { remote, tag, cwd }) {
  const localTag = await gitStdout(commandRunner, ["tag", "--list", tag], { cwd });
  if (localTag.trim().length > 0) {
    throw new ReleasePrepareLocalError(
      `Local tag ${tag} already exists. Bump to a new version instead of reusing it.`
    );
  }

  const remoteResult = await commandRunner(
    "git",
    ["ls-remote", "--tags", remote, `refs/tags/${tag}`],
    { allowFailure: true, cwd }
  );
  if (remoteResult.exitCode !== 0) {
    throw new ReleasePrepareLocalError(
      `Unable to query remote tag ${tag}: ${remoteResult.stderr.trim() || remoteResult.stdout.trim()}`
    );
  }

  if (remoteResult.stdout.trim().length > 0) {
    throw new ReleasePrepareLocalError(
      `Remote tag ${tag} already exists. Bump to a new version instead of reusing it.`
    );
  }
}

export async function runValidationSuite(commandRunner, cwd) {
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const commands = [
    [pnpmCommand, ["lint"]],
    [pnpmCommand, ["typecheck"]],
    [pnpmCommand, ["test"]]
  ];

  for (const [command, args] of commands) {
    await commandRunner(command, args, { cwd });
  }
}

export async function commitVersionFilesIfNeeded(commandRunner, { cwd, tag }) {
  await commandRunner("git", ["add", ...VERSION_FILES], { cwd });

  const stagedFiles = await gitStdout(
    commandRunner,
    ["diff", "--cached", "--name-only", "--", ...VERSION_FILES],
    { cwd }
  );

  if (!stagedFiles.trim()) {
    return false;
  }

  await commandRunner("git", ["commit", "-m", `chore: prepare release ${tag}`], { cwd });
  return true;
}

export async function runReleasePrepareLocal({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  commandRunner = runCommand
} = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    return { exitCode: 0, stdout: `${printHelp()}\n` };
  }

  if (!options.tag) {
    throw new ReleasePrepareLocalError("Missing required --tag argument.");
  }

  parseReleaseTag(options.tag);
  await ensureCurrentBranch(commandRunner, options.branch, cwd);
  await ensureTagAvailable(commandRunner, {
    cwd,
    remote: options.remote,
    tag: options.tag
  });
  const createdPrepCommit = await ensureCleanOrAutoCommit({
    autoCommit: options.autoCommit,
    commandRunner,
    commitMessage: options.commitMessage,
    cwd
  });

  const headShaBefore = await gitStdout(commandRunner, ["rev-parse", "HEAD"], { cwd });
  if (options.dryRun) {
    return {
      exitCode: 0,
      stdout: formatSummary({
        branch: options.branch,
        committedVersionFiles: false,
        createdPrepCommit,
        dryRun: true,
        headSha: headShaBefore,
        remote: options.remote,
        tag: options.tag
      })
    };
  }

  await runReleaseSyncVersion({
    argv: ["--tag", options.tag],
    cwd
  });
  await runReleasePreflight({
    argv: ["--tag", options.tag],
    cwd
  });
  await runValidationSuite(commandRunner, cwd);

  const committedVersionFiles = await commitVersionFilesIfNeeded(commandRunner, {
    cwd,
    tag: options.tag
  });

  await commandRunner("git", ["push", options.remote, `HEAD:${options.branch}`], { cwd });
  await commandRunner("git", ["tag", options.tag, "HEAD"], { cwd });
  await commandRunner("git", ["push", options.remote, `refs/tags/${options.tag}`], { cwd });

  const headShaAfter = await gitStdout(commandRunner, ["rev-parse", "HEAD"], { cwd });

  return {
    exitCode: 0,
    stdout: formatSummary({
      branch: options.branch,
      committedVersionFiles,
      createdPrepCommit,
      dryRun: false,
      headSha: headShaAfter,
      remote: options.remote,
      tag: options.tag
    })
  };
}

async function main() {
  try {
    const result = await runReleasePrepareLocal();
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

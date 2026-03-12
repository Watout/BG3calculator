import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { VERSION_FILES, parseReleaseTag } from "./release-preflight.mjs";

export class ReleaseSyncVersionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseSyncVersionError";
  }
}

export function parseCliArgs(argv) {
  const options = {
    cwd: null,
    dryRun: false,
    help: false,
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

    if (value === "--tag") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleaseSyncVersionError("Missing value for --tag.");
      }
      options.tag = nextValue;
      index += 1;
      continue;
    }

    if (value === "--cwd") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleaseSyncVersionError("Missing value for --cwd.");
      }
      options.cwd = path.resolve(nextValue);
      index += 1;
      continue;
    }

    throw new ReleaseSyncVersionError(`Unknown argument: ${value}`);
  }

  return options;
}

export function printHelp() {
  return [
    "Usage: pnpm release:sync-version -- --tag <tag> [options]",
    "",
    "Options:",
    "  --tag <tag>                Release tag/version to write into all release manifests. Required.",
    "  --cwd <path>               Override the repository root. Defaults to the current directory.",
    "  --dry-run                  Print planned updates without writing files.",
    "  --help, -h                 Show this help text."
  ].join("\n");
}

export function updateJsonVersion(contents, version) {
  const parsed = JSON.parse(contents);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ReleaseSyncVersionError("Expected a JSON object with a version field.");
  }

  const previousVersion = parsed.version;
  if (!previousVersion || typeof previousVersion !== "string") {
    throw new ReleaseSyncVersionError("JSON manifest is missing a string version field.");
  }

  parsed.version = version;

  return {
    nextContents: `${JSON.stringify(parsed, null, 2)}\n`,
    previousVersion
  };
}

export function updateCargoPackageVersion(contents, version) {
  const packageSectionMatch = /\[package\]([\s\S]*?)(?:\n\[|$)/u.exec(contents);
  if (!packageSectionMatch) {
    throw new ReleaseSyncVersionError("Cargo.toml is missing a [package] section.");
  }

  const packageSectionBody = packageSectionMatch[1];
  const versionMatch = /^[ \t]*version[ \t]*=[ \t]*"([^"]+)"[ \t]*$/mu.exec(packageSectionBody);
  if (!versionMatch) {
    throw new ReleaseSyncVersionError('Cargo.toml is missing package version = "<value>".');
  }

  const packageBodyStart = packageSectionMatch.index + "[package]".length;
  const packageBodyEnd = packageBodyStart + packageSectionBody.length;
  const nextPackageSectionBody = packageSectionBody.replace(
    versionMatch[0],
    `version = "${version}"`
  );

  return {
    nextContents: `${contents.slice(0, packageBodyStart)}${nextPackageSectionBody}${contents.slice(packageBodyEnd)}`,
    previousVersion: versionMatch[1]
  };
}

export async function syncDeclaredVersions({
  cwd,
  dryRun = false,
  readFileImpl = readFile,
  version,
  writeFileImpl = writeFile
}) {
  const changes = [];

  for (const file of VERSION_FILES) {
    const fullPath = path.join(cwd, file.relativePath);
    const contents = await readFileImpl(fullPath, "utf8");
    const updater =
      file.kind === "cargo"
        ? updateCargoPackageVersion
        : updateJsonVersion;
    const { nextContents, previousVersion } = updater(contents, version);
    const changed = previousVersion !== version;

    if (changed && !dryRun) {
      await writeFileImpl(fullPath, nextContents, "utf8");
    }

    changes.push({
      changed,
      previousVersion,
      relativePath: file.relativePath,
      version
    });
  }

  return changes;
}

export function formatSyncSummary({ changes, dryRun, version }) {
  const header = dryRun
    ? `Dry run: would synchronize release version to ${version}`
    : `Synchronized release version to ${version}`;
  const lines = changes.map((change) => {
    const prefix = change.changed
      ? dryRun
        ? "Would update"
        : "Updated"
      : "Already aligned";
    return `${prefix}: ${change.relativePath} (${change.previousVersion} -> ${change.version})`;
  });

  return `${[header, ...lines].join("\n")}\n`;
}

export async function runReleaseSyncVersion({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  readFileImpl = readFile,
  writeFileImpl = writeFile
} = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    return { exitCode: 0, stdout: `${printHelp()}\n` };
  }

  if (!options.tag) {
    throw new ReleaseSyncVersionError("Missing required --tag argument.");
  }

  const release = parseReleaseTag(options.tag);
  const changes = await syncDeclaredVersions({
    cwd: options.cwd ?? cwd,
    dryRun: options.dryRun,
    readFileImpl,
    version: release.version,
    writeFileImpl
  });

  return {
    exitCode: 0,
    stdout: formatSyncSummary({
      changes,
      dryRun: options.dryRun,
      version: release.version
    })
  };
}

async function main() {
  try {
    const result = await runReleaseSyncVersion();
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

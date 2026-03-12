import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const RELEASE_TAG_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

export const VERSION_FILES = [
  {
    kind: "json",
    label: "workspace package.json",
    relativePath: "package.json"
  },
  {
    kind: "json",
    label: "desktop package.json",
    relativePath: "apps/desktop-tauri/package.json"
  },
  {
    kind: "tauri-config",
    label: "Tauri config",
    relativePath: "apps/desktop-tauri/src-tauri/tauri.conf.json"
  },
  {
    kind: "cargo",
    label: "Cargo manifest",
    relativePath: "apps/desktop-tauri/src-tauri/Cargo.toml"
  }
];

export class ReleasePreflightError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleasePreflightError";
  }
}

export function parseCliArgs(argv) {
  const options = {
    cwd: null,
    help: false,
    tag: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--help" || value === "-h") {
      options.help = true;
      continue;
    }

    if (value === "--tag") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePreflightError("Missing value for --tag.");
      }
      options.tag = nextValue;
      index += 1;
      continue;
    }

    if (value === "--cwd") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new ReleasePreflightError("Missing value for --cwd.");
      }
      options.cwd = path.resolve(nextValue);
      index += 1;
      continue;
    }

    throw new ReleasePreflightError(`Unknown argument: ${value}`);
  }

  return options;
}

export function printHelp() {
  return [
    "Usage: pnpm release:preflight -- --tag <tag> [options]",
    "",
    "Options:",
    "  --tag <tag>                Release tag to validate. Required.",
    "  --cwd <path>               Override the repository root. Defaults to the current directory.",
    "  --help, -h                 Show this help text."
  ].join("\n");
}

export function parseReleaseTag(tag) {
  if (!tag) {
    throw new ReleasePreflightError("Release tag is required.");
  }

  const match = RELEASE_TAG_PATTERN.exec(tag);
  if (!match) {
    throw new ReleasePreflightError(
      `Release tag "${tag}" must be a semantic version without a leading "v", for example 0.1.2 or 0.1.2-beta.1.`
    );
  }

  return {
    isPrerelease: Boolean(match[4]),
    version: tag
  };
}

export function extractCargoPackageVersion(contents) {
  const packageSectionMatch = /\[package\]([\s\S]*?)(?:\n\[|$)/u.exec(contents);
  if (!packageSectionMatch) {
    throw new ReleasePreflightError("Cargo.toml is missing a [package] section.");
  }

  const versionMatch = /^\s*version\s*=\s*"([^"]+)"\s*$/mu.exec(packageSectionMatch[1]);
  if (!versionMatch) {
    throw new ReleasePreflightError('Cargo.toml is missing package version = "<value>".');
  }

  return versionMatch[1];
}

export async function collectDeclaredVersions({ cwd, readFileImpl = readFile }) {
  const records = [];

  for (const file of VERSION_FILES) {
    const fullPath = path.join(cwd, file.relativePath);
    const contents = await readFileImpl(fullPath, "utf8");

    let version;
    if (file.kind === "cargo") {
      version = extractCargoPackageVersion(contents);
    } else {
      const parsed = JSON.parse(contents);
      version = parsed.version;
    }

    if (!version) {
      throw new ReleasePreflightError(`${file.relativePath} is missing a version field.`);
    }

    records.push({
      label: file.label,
      relativePath: file.relativePath,
      version
    });
  }

  return records;
}

export function validateVersionAlignment({ releaseVersion, records }) {
  const mismatches = records.filter((record) => record.version !== releaseVersion);

  if (mismatches.length > 0) {
    const mismatchList = mismatches
      .map((record) => `- ${record.relativePath}: found ${record.version}, expected ${releaseVersion}`)
      .join("\n");

    throw new ReleasePreflightError(
      `Release version mismatch detected for tag ${releaseVersion}:\n${mismatchList}`
    );
  }

  return {
    records,
    releaseVersion
  };
}

export function formatGitHubOutputs({ tag, version, isPrerelease }) {
  return [
    `tag=${tag}`,
    `version=${version}`,
    `is_prerelease=${String(isPrerelease)}`
  ].join("\n");
}

export async function runReleasePreflight({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  readFileImpl = readFile,
  writeFileImpl = writeFile
} = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    return { exitCode: 0, stdout: `${printHelp()}\n` };
  }

  const tag = options.tag;
  if (!tag) {
    throw new ReleasePreflightError("Missing required --tag argument.");
  }

  const release = parseReleaseTag(tag);
  const records = await collectDeclaredVersions({
    cwd: options.cwd ?? cwd,
    readFileImpl
  });
  validateVersionAlignment({
    records,
    releaseVersion: release.version
  });

  const githubOutput = env.GITHUB_OUTPUT;
  const stdoutLines = [
    `Validated release tag: ${release.version}`,
    `Prerelease: ${release.isPrerelease ? "yes" : "no"}`
  ];

  if (githubOutput) {
    const existing = await readFileImpl(githubOutput, "utf8").catch(() => "");
    const outputs = formatGitHubOutputs({
      isPrerelease: release.isPrerelease,
      tag: release.version,
      version: release.version
    });
    const nextContents = existing ? `${existing.trimEnd()}\n${outputs}\n` : `${outputs}\n`;
    await writeFileImpl(githubOutput, nextContents, "utf8");
  }

  return {
    exitCode: 0,
    stdout: `${stdoutLines.join("\n")}\n`
  };
}

async function main() {
  try {
    const result = await runReleasePreflight();
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

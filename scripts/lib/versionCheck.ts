/**
 * Decides what a pull request means for the app's version: whether merging it
 * publishes a release, and whether it should have bumped the version.
 */

export interface VersionCheckInput {
  readonly baseVersion: string;
  readonly headVersion: string;
  /** The version recorded in package-lock.json, which must match package.json. */
  readonly lockVersion: string;
  /**
   * Whether the built file differs from the base branch's. This catches every change
   * people would download, including dependency upgrades, and nothing else.
   */
  readonly appChanged: boolean;
}

export interface VersionCheckResult {
  readonly ok: boolean;
  readonly message: string;
  /** The version merging publishes, like "v1.1.0", or null for none. */
  readonly releases: string | null;
}

const BUMP_HELP =
  'Bump it with `npm version patch --no-git-tag-version` for fixes and polish, `minor` for new features, or `major` for breaking changes.';

export function checkVersion({
  baseVersion,
  headVersion,
  lockVersion,
  appChanged,
}: VersionCheckInput): VersionCheckResult {
  const base = parseVersion(baseVersion);
  const head = parseVersion(headVersion);
  if (!head) {
    return { ok: false, releases: null, message: `package.json has version "${headVersion}"; use the form 1.2.3.` };
  }
  if (lockVersion !== headVersion) {
    return {
      ok: false,
      releases: null,
      message: `package-lock.json says ${lockVersion} but package.json says ${headVersion}. Run \`npm install\` to update it.`,
    };
  }
  const order = base ? compareVersions(head, base) : 1;
  if (order < 0) {
    return { ok: false, releases: null, message: `The version goes backwards, from ${baseVersion} to ${headVersion}.` };
  }
  if (order > 0) {
    return {
      ok: true,
      releases: `v${headVersion}`,
      message: `Merging this releases v${headVersion} (now v${baseVersion}).`,
    };
  }

  if (appChanged) {
    return {
      ok: false,
      releases: null,
      message: `This changes the built app but keeps version ${headVersion}. ${BUMP_HELP}`,
    };
  }
  return {
    ok: true,
    releases: null,
    message: `Merging this doesn't release a new version: the built app stays the same.`,
  };
}

type Version = readonly [major: number, minor: number, patch: number];

function parseVersion(text: string): Version | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a: Version, b: Version): number {
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] as number) - (b[index] as number);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

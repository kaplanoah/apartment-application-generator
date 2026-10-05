/**
 * CI step for pull requests: reports whether merging publishes a release, and
 * fails when the built app changes without a version bump. Run with BASE_REF set
 * to the pull request's base branch, and BASE_BUILD and HEAD_BUILD pointing at
 * the two built files; on pushes it only reports the version.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { checkVersion } from './lib/versionCheck.ts';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });
const readVersion = (json: string) => (JSON.parse(json) as { version: string }).version;
const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}.`);
  return value;
};

const headVersion = readVersion(readFileSync('package.json', 'utf8'));
const baseRef = process.env.BASE_REF;

if (!baseRef) {
  console.log(`Version ${headVersion}.`);
} else {
  const result = checkVersion({
    baseVersion: readVersion(git('show', `origin/${baseRef}:package.json`)),
    headVersion,
    lockVersion: readVersion(readFileSync('package-lock.json', 'utf8')),
    appChanged: !readFileSync(requireEnv('BASE_BUILD')).equals(readFileSync(requireEnv('HEAD_BUILD'))),
  });
  console.log(`${result.ok ? '::notice' : '::error'} title=Version::${result.message}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.message}\n`);
  if (!result.ok) process.exitCode = 1;
}

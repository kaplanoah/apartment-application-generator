/**
 * CI step for pull requests: reports whether merging publishes a release, and
 * fails when the app changes without a version bump. Run with BASE_REF set to
 * the pull request's base branch; on pushes it only reports the version.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { checkVersion } from './lib/versionCheck.ts';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });
const versionIn = (json: string) => (JSON.parse(json) as { version: string }).version;

const headVersion = versionIn(readFileSync('package.json', 'utf8'));
const baseRef = process.env.BASE_REF;

if (!baseRef) {
  console.log(`Version ${headVersion}.`);
} else {
  const result = checkVersion({
    baseVersion: versionIn(git('show', `origin/${baseRef}:package.json`)),
    headVersion,
    lockVersion: versionIn(readFileSync('package-lock.json', 'utf8')),
    changedFiles: git('diff', '--name-only', `origin/${baseRef}...HEAD`).split('\n').filter(Boolean),
  });
  console.log(`${result.ok ? '::notice' : '::error'} title=Version::${result.message}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.message}\n`);
  if (!result.ok) process.exitCode = 1;
}

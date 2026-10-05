import { describe, expect, it } from 'vitest';
import { checkVersion } from '../../scripts/lib/versionCheck';

const input = (overrides: Partial<Parameters<typeof checkVersion>[0]> = {}) => ({
  baseVersion: '1.0.0',
  headVersion: '1.0.0',
  lockVersion: '1.0.0',
  appChanged: false,
  ...overrides,
});

describe('checkVersion', () => {
  it('says which version merging releases', () => {
    const result = checkVersion(input({ headVersion: '1.1.0', lockVersion: '1.1.0', appChanged: true }));
    expect(result).toEqual({ ok: true, releases: 'v1.1.0', message: 'Merging this releases v1.1.0 (now v1.0.0).' });
  });

  it('passes changes that leave the built app the same, without a release', () => {
    const result = checkVersion(input({ appChanged: false }));
    expect(result).toEqual({
      ok: true,
      releases: null,
      message: "Merging this doesn't release a new version: the built app stays the same.",
    });
  });

  it('fails when the built app changes but the version stays the same', () => {
    const result = checkVersion(input({ appChanged: true }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('changes the built app but keeps version 1.0.0');
    expect(result.message).toContain('npm version patch');
  });

  it('fails when the version goes backwards or is malformed', () => {
    expect(checkVersion(input({ headVersion: '0.9.0', lockVersion: '0.9.0' })).ok).toBe(false);
    expect(checkVersion(input({ baseVersion: '1.10.0', headVersion: '1.9.0', lockVersion: '1.9.0' })).ok).toBe(false);
    for (const version of ['1.1', 'v1.1.0', '1.01.0', '1.1.0-beta']) {
      expect(checkVersion(input({ headVersion: version, lockVersion: version })).ok).toBe(false);
    }
  });

  it('compares versions numerically', () => {
    expect(checkVersion(input({ baseVersion: '1.9.0', headVersion: '1.10.0', lockVersion: '1.10.0' })).releases).toBe(
      'v1.10.0',
    );
  });

  it('fails when package-lock.json disagrees with package.json', () => {
    const result = checkVersion(input({ headVersion: '1.1.0', lockVersion: '1.0.0' }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('npm install');
  });
});

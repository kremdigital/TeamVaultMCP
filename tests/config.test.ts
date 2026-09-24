import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';

const REQUIRED = { TEAM_VAULT_URL: 'https://vault.test', TEAM_VAULT_API_KEY: 'osync_test_key' };

describe('readConfig', () => {
  it.each([
    ['TEAM_VAULT_URL missing', { TEAM_VAULT_API_KEY: 'k' }],
    ['TEAM_VAULT_API_KEY missing', { TEAM_VAULT_URL: 'https://vault.test' }],
    ['TEAM_VAULT_URL empty', { TEAM_VAULT_URL: '', TEAM_VAULT_API_KEY: 'k' }],
    ['TEAM_VAULT_API_KEY empty', { TEAM_VAULT_URL: 'https://vault.test', TEAM_VAULT_API_KEY: '' }],
  ])('returns null when %s', (_label, env) => {
    expect(readConfig(env)).toBeNull();
  });

  it('reads the required variables and the default project', () => {
    expect(readConfig({ ...REQUIRED, TEAM_VAULT_PROJECT_ID: 'cmq1' })).toEqual({
      baseUrl: 'https://vault.test',
      apiKey: 'osync_test_key',
      defaultProjectId: 'cmq1',
      readOnly: false,
    });
  });

  it.each(['1', 'true', 'TRUE', 'yes', 'Yes', 'on', 'ON'])(
    'TEAM_VAULT_READ_ONLY=%s turns read-only mode on',
    (value) => {
      expect(readConfig({ ...REQUIRED, TEAM_VAULT_READ_ONLY: value })?.readOnly).toBe(true);
    },
  );

  it.each(['', '0', 'false', 'no', 'off', ' 1', 'true ', 'readonly', '2'])(
    'TEAM_VAULT_READ_ONLY=%j keeps the write tools',
    (value) => {
      expect(readConfig({ ...REQUIRED, TEAM_VAULT_READ_ONLY: value })?.readOnly).toBe(false);
    },
  );

  it('read-only mode is off when TEAM_VAULT_READ_ONLY is not set', () => {
    expect(readConfig(REQUIRED)?.readOnly).toBe(false);
  });
});

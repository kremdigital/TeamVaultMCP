/**
 * Environment → server configuration. Kept apart from the stdio entry point
 * (`index.ts`) so the parsing can be tested without starting a process.
 */

export interface ServerConfig {
  baseUrl: string;
  apiKey: string;
  /** Project used by tools called without `projectId`. */
  defaultProjectId: string | undefined;
  /** Read-only mode: the write tools are not registered at all. */
  readOnly: boolean;
}

export const USAGE =
  'TeamVaultMCP: set TEAM_VAULT_URL and TEAM_VAULT_API_KEY (optional: TEAM_VAULT_PROJECT_ID, TEAM_VAULT_READ_ONLY).';

/** `null` when a required variable is missing or empty. */
export function readConfig(env: NodeJS.ProcessEnv): ServerConfig | null {
  const baseUrl = env.TEAM_VAULT_URL;
  const apiKey = env.TEAM_VAULT_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl,
    apiKey,
    defaultProjectId: env.TEAM_VAULT_PROJECT_ID,
    readOnly: /^(1|true|yes|on)$/i.test(env.TEAM_VAULT_READ_ONLY ?? ''),
  };
}

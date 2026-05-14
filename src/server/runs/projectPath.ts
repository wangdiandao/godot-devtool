export function normalizeRunProjectPath(value?: string | null): string {
  return (value ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function projectPathMatches(runPath: string, requestedPath?: string | null): boolean {
  const requested = normalizeRunProjectPath(requestedPath);
  return requested.length === 0 || normalizeRunProjectPath(runPath) === requested;
}

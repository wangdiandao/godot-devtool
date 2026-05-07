export function isSafeProjectRelativePath(path: string): boolean {
  if (!path) {
    return false;
  }

  const normalized = path.replace(/\\/g, '/');
  if (normalized.split('/').some((segment) => segment === '..')) {
    return false;
  }

  if (normalized.startsWith('/')) {
    return false;
  }

  if (/^[A-Za-z]:[\\/]/.test(normalized)) {
    return false;
  }

  return true;
}

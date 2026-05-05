export function isSafeProjectRelativePath(path: string): boolean {
  if (!path || path.includes('..')) {
    return false;
  }

  if (path.startsWith('/') || path.startsWith('\\')) {
    return false;
  }

  if (/^[A-Za-z]:[\\/]/.test(path)) {
    return false;
  }

  return true;
}

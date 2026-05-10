import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

export const PACKAGE_NAME = 'godot-devtool';
export const PACKAGE_VERSION = readPackageVersion();

export function godotPathGuidance(platform: NodeJS.Platform = process.platform): string[] {
  const examples = platform === 'win32'
    ? [
        'Set GODOT_PATH in the MCP client env block, for example "GODOT_PATH": "D:/Program Files/Godot/Godot_v4.x.exe".',
        'If Godot was installed through Steam, point GODOT_PATH at the exact Godot.exe inside the Steam library.',
      ]
    : [
        'Set GODOT_PATH in the MCP client env block, for example "GODOT_PATH": "/Applications/Godot.app/Contents/MacOS/Godot".',
        'If the MCP client starts with a minimal stdio environment, do not rely on shell profile PATH exports.',
      ];

  return [
    ...examples,
    'Alternatively pass { "godotPath": "/absolute/path/to/godot" } when constructing the server.',
    'Run get_godot_version after changing the client config to confirm the executable is visible to the MCP process.',
  ];
}

function readPackageVersion(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDirectory, '..', '..', 'package.json'),
    resolve(process.cwd(), 'package.json'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: unknown };
      if (typeof parsed.version === 'string' && parsed.version.trim()) {
        return parsed.version;
      }
    } catch {
      // Try the next candidate; the server can still start with the fallback below.
    }
  }

  return '2.8.2';
}

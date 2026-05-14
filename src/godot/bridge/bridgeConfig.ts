import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const BRIDGE_CONFIG_PATH = '.godot-devtool/bridge-config.json';

export interface GodotDevtoolBridgeConfig {
  mode: 'websocket';
  instanceId: string;
  projectPath: string;
  host: string;
  port: number;
  url: string;
  authToken: string;
  brokerId?: string;
  runId?: string;
}

export async function readBridgeConfigFile(projectPath: string): Promise<GodotDevtoolBridgeConfig | null> {
  const absolutePath = join(projectPath, BRIDGE_CONFIG_PATH);
  if (!existsSync(absolutePath)) return null;
  return JSON.parse(await readFile(absolutePath, 'utf8')) as GodotDevtoolBridgeConfig;
}

export async function writeBridgeConfigFile(projectPath: string, config: GodotDevtoolBridgeConfig): Promise<void> {
  const absolutePath = join(projectPath, BRIDGE_CONFIG_PATH);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(config, null, 2), 'utf8');
}

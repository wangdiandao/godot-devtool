/**
 * Registers split GodotServer tool implementation modules.
 *
 * Keep new route-specific logic in src/server/handlers/* or the matching
 * src/server/methods/* module instead of growing this facade.
 */

import { registerGodotServerSharedMethods } from './methods/shared.js';
import { registerGodotServerCompatibilityMethods } from './methods/compatibility.js';
import { registerGodotServerCoreMethods } from './methods/core.js';
import { registerGodotServerProjectMethods } from './methods/project.js';
import { registerGodotServerEditorMethods } from './methods/editor.js';
import { registerGodotServerFilesystemMethods } from './methods/filesystem.js';
import { registerGodotServerResourceMethods } from './methods/resource.js';
import { registerGodotServerScriptMethods } from './methods/script.js';
import { registerGodotServerNodeMethods } from './methods/node.js';
import { registerGodotServerVisualMethods } from './methods/visual.js';
import { registerGodotServerSceneMethods } from './methods/scene.js';

/**
 * Interface for server configuration.
 */
export interface GodotServerConfig {
  godotPath?: string;
  debugMode?: boolean;
  godotDebugMode?: boolean;
  strictPathValidation?: boolean;
}

export function registerGodotServerMethods(GodotServerCtor: any): void {
  registerGodotServerSharedMethods(GodotServerCtor);
  registerGodotServerCompatibilityMethods(GodotServerCtor);
  registerGodotServerCoreMethods(GodotServerCtor);
  registerGodotServerProjectMethods(GodotServerCtor);
  registerGodotServerEditorMethods(GodotServerCtor);
  registerGodotServerFilesystemMethods(GodotServerCtor);
  registerGodotServerResourceMethods(GodotServerCtor);
  registerGodotServerScriptMethods(GodotServerCtor);
  registerGodotServerNodeMethods(GodotServerCtor);
  registerGodotServerVisualMethods(GodotServerCtor);
  registerGodotServerSceneMethods(GodotServerCtor);
}

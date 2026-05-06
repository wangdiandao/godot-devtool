import { existsSync } from 'fs';
import { join } from 'path';
import { createToolHandlers } from '../build/server/handlers/index.js';
import { GODOT_TOOL_ALIASES, GODOT_TOOL_DEFINITIONS } from '../build/tools/toolDefinitions.js';

const requiredFiles = [
  'src/tools/definitions/core.ts',
  'src/tools/definitions/project.ts',
  'src/tools/definitions/editor.ts',
  'src/tools/definitions/filesystem.ts',
  'src/tools/definitions/resource.ts',
  'src/tools/definitions/script.ts',
  'src/tools/definitions/node.ts',
  'src/tools/definitions/scene.ts',
  'src/tools/definitions/visual.ts',
  'src/tools/definitions/index.ts',
];

const missingFiles = requiredFiles.filter((filePath) => !existsSync(join(process.cwd(), filePath)));
if (missingFiles.length > 0) {
  console.error(`Missing tool definition modules:\n${missingFiles.join('\n')}`);
  process.exit(1);
}

const toolNames = GODOT_TOOL_DEFINITIONS.map((tool) => tool.name);
const duplicateNames = toolNames.filter((name, index) => toolNames.indexOf(name) !== index);
if (duplicateNames.length > 0) {
  console.error(`Duplicate tool definitions: ${[...new Set(duplicateNames)].join(', ')}`);
  process.exit(1);
}

for (const [aliasName, targetName] of Object.entries(GODOT_TOOL_ALIASES)) {
  if (!toolNames.includes(targetName)) {
    console.error(`Alias ${aliasName} points to missing tool ${targetName}`);
    process.exit(1);
  }
}

const canonicalToolNames = GODOT_TOOL_DEFINITIONS
  .filter((tool) => !tool.canonicalName)
  .map((tool) => tool.name);
const handlerHost = new Proxy({}, {
  get: () => () => undefined,
});
const handlerNames = Object.keys(createToolHandlers(handlerHost));
const missingHandlers = canonicalToolNames.filter((toolName) => !handlerNames.includes(toolName));
const extraHandlers = handlerNames.filter((toolName) => !canonicalToolNames.includes(toolName));

if (missingHandlers.length > 0) {
  console.error(`Missing handlers for tools: ${missingHandlers.join(', ')}`);
  process.exit(1);
}

if (extraHandlers.length > 0) {
  console.error(`Handlers without tool definitions: ${extraHandlers.join(', ')}`);
  process.exit(1);
}

if (GODOT_TOOL_DEFINITIONS.length < 70) {
  console.error(`Unexpectedly low tool count: ${GODOT_TOOL_DEFINITIONS.length}`);
  process.exit(1);
}

console.log(`Verified ${GODOT_TOOL_DEFINITIONS.length} tool definitions and ${Object.keys(GODOT_TOOL_ALIASES).length} aliases.`);

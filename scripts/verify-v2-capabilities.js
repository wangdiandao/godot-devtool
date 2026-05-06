import assert from 'node:assert/strict';

const { GODOT_TOOL_DEFINITIONS } = await import('../build/tools/toolDefinitions.js');

const tools = new Map(GODOT_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));

for (const requiredName of ['plugin_install', 'plugin_status', 'plugin_reload']) {
  assert.ok(tools.has(requiredName), `Missing v2 plugin tool: ${requiredName}`);
}

for (const [name, tool] of tools) {
  assert.ok(tool.routeGroup, `Tool ${name} is missing routeGroup`);
  assert.ok(tool.transport, `Tool ${name} is missing transport`);
  assert.ok(tool.riskLevel, `Tool ${name} is missing riskLevel`);
  assert.equal(typeof tool.requiresEditor, 'boolean', `Tool ${name} is missing requiresEditor boolean`);
  assert.equal(typeof tool.requiresRuntime, 'boolean', `Tool ${name} is missing requiresRuntime boolean`);
}

const invalidBridgeModes = [...tools.values()]
  .filter((tool) => String(tool.transport).includes('file_queue') || String(tool.description).toLowerCase().includes('file-based live editor bridge'));
assert.deepEqual(invalidBridgeModes.map((tool) => tool.name), [], 'v2 must not advertise file-queue bridge routes');

const pluginInstall = tools.get('plugin_install');
assert.equal(pluginInstall.transport, 'native');
assert.equal(pluginInstall.routeGroup, 'editor');

const editorStatus = tools.get('editor_bridge_status');
assert.ok(editorStatus, 'editor_bridge_status compatibility tool must remain available');
assert.equal(editorStatus.canonicalName ?? 'plugin_status', 'plugin_status');

console.log(`Verified v2 capability metadata for ${tools.size} tools.`);

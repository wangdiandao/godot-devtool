import assert from 'node:assert/strict';

const { getBrowserVisualizer } = await import('../build/server/transports/browserVisualizer.js');
const { createToolHandlers } = await import('../build/server/handlers/index.js');
const { GODOT_TOOL_DEFINITIONS } = await import('../build/tools/toolDefinitions.js');
const { GodotServer } = await import('../build/server/GodotServer.js');

const toolsByName = new Map(GODOT_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));
const visualizerTools = [
  'browser_visualizer_start',
  'browser_visualizer_status',
  'browser_visualizer_stop',
];

for (const toolName of visualizerTools) {
  const tool = toolsByName.get(toolName);
  assert.ok(tool, `Missing Browser visualizer tool definition: ${toolName}`);
  assert.equal(tool.routeGroup, 'core');
  assert.equal(tool.transport, 'process_control');
  assert.equal(tool.requiresEditor, false);
  assert.equal(tool.requiresRuntime, false);
}

const handlers = createToolHandlers(new Proxy({}, { get: () => () => undefined }));
for (const toolName of visualizerTools) {
  assert.equal(typeof handlers[toolName], 'function', `Missing handler for ${toolName}`);
}

const server = new GodotServer();
const visualizer = getBrowserVisualizer();

try {
  const startResponse = await server.handleBrowserVisualizerStart({
    port: 0,
    projectPath: 'E:/sample-godot-project',
  });
  assert.equal(startResponse.isError, undefined);
  const startPayload = JSON.parse(startResponse.content[0].text);
  assert.equal(startPayload.running, true);
  assert.match(startPayload.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal(startPayload.projectPath, 'E:/sample-godot-project');

  const page = await fetch(startPayload.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') || '', /text\/html/);
  const html = await page.text();
  assert.match(html, /godot-devtool Browser Visualizer/);
  assert.match(html, /Runtime Screenshots/);
  assert.match(html, /get_game_scene_tree/);

  const statusResponse = await fetch(new URL('/api/status', startPayload.url));
  assert.equal(statusResponse.status, 200);
  const statusPayload = await statusResponse.json();
  assert.equal(statusPayload.running, true);
  assert.equal(statusPayload.projectPath, 'E:/sample-godot-project');
  assert.equal(statusPayload.bridge.host, '127.0.0.1');
  assert.ok(Array.isArray(statusPayload.bridge.clients));

  const toolStatusResponse = await server.handleBrowserVisualizerStatus({});
  const toolStatusPayload = JSON.parse(toolStatusResponse.content[0].text);
  assert.equal(toolStatusPayload.running, true);
  assert.equal(toolStatusPayload.url, startPayload.url);

  const stopResponse = await server.handleBrowserVisualizerStop({});
  const stopPayload = JSON.parse(stopResponse.content[0].text);
  assert.equal(stopPayload.running, false);
} finally {
  await visualizer.stop();
}

console.log('Verified Browser visualizer tools, handlers, page, and status API.');

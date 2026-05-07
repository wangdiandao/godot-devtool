import { readFileSync, writeFileSync } from 'node:fs';

import { GODOT_TOOL_DEFINITIONS } from '../build/tools/toolDefinitions.js';

const GROUP_ORDER = ['project', 'scene', 'node', 'script', 'editor', 'filesystem', 'resource', 'visual', 'runtime', 'core'];
const EN_GROUP_LABELS = {
  project: 'Project Tools',
  scene: 'Scene Tools',
  node: 'Node Tools',
  script: 'Script Tools',
  editor: 'Editor Tools',
  filesystem: 'Filesystem Tools',
  resource: 'Resource Tools',
  visual: 'Visual Tools',
  runtime: 'Runtime Tools',
  core: 'Core Tools',
};
const ZH_GROUP_LABELS = {
  project: '项目工具',
  scene: '场景工具',
  node: '节点工具',
  script: '脚本工具',
  editor: '编辑器工具',
  filesystem: '文件系统工具',
  resource: '资源工具',
  visual: '视觉工具',
  runtime: '运行时工具',
  core: '核心工具',
};

const ACTION_TOKENS = new Set([
  'get', 'list', 'read', 'create', 'set', 'update', 'add', 'remove', 'delete', 'stop', 'run', 'play', 'save', 'open',
  'clear', 'reload', 'export', 'search', 'find', 'analyze', 'inspect', 'preview', 'generate', 'simulate', 'capture',
  'monitor', 'start', 'replay', 'assert', 'compare', 'attach', 'edit', 'assign', 'duplicate', 'move', 'rename',
  'connect', 'disconnect', 'batch', 'cross', 'detect', 'bake', 'setup', 'apply', 'execute',
]);

const TOKEN_ZH = {
  get: '获取',
  list: '列出',
  read: '读取',
  create: '创建',
  set: '设置',
  update: '更新',
  add: '添加',
  remove: '移除',
  delete: '删除',
  stop: '停止',
  run: '运行',
  play: '运行',
  save: '保存',
  open: '打开',
  clear: '清理',
  reload: '重载',
  export: '导出',
  search: '搜索',
  find: '查找',
  analyze: '分析',
  inspect: '检查',
  preview: '预览',
  generate: '生成',
  simulate: '模拟',
  capture: '捕获',
  monitor: '监控',
  start: '开始',
  replay: '回放',
  assert: '断言',
  compare: '对比',
  attach: '挂载',
  edit: '编辑',
  assign: '分配',
  duplicate: '复制',
  move: '移动',
  rename: '重命名',
  connect: '连接',
  disconnect: '断开',
  batch: '批量',
  cross: '跨场景',
  detect: '检测',
  bake: '烘焙',
  setup: '配置',
  apply: '应用',
  execute: '执行',
  project: '项目',
  projects: '项目',
  scene: '场景',
  scenes: '场景',
  node: '节点',
  nodes: '节点',
  script: '脚本',
  scripts: '脚本',
  editor: '编辑器',
  filesystem: '文件系统',
  file: '文件',
  files: '文件',
  resource: '资源',
  resources: '资源',
  runtime: '运行时',
  game: '游戏',
  input: '输入',
  action: '操作',
  actions: '操作',
  animation: '动画',
  animations: '动画',
  tree: '树',
  state: '状态',
  machine: '机',
  blend: '混合',
  tilemap: 'TileMap',
  tile: '图块',
  theme: '主题',
  ui: 'UI',
  shader: '着色器',
  material: '材质',
  physics: '物理',
  collision: '碰撞',
  navigation: '导航',
  audio: '音频',
  particle: '粒子',
  particles: '粒子',
  lighting: '灯光',
  camera: '摄像机',
  environment: '环境',
  preset: '预设',
  presets: '预设',
  safety: '安全',
  policy: '策略',
  audit: '审计',
  rollback: '回滚',
  dependency: '依赖',
  dependencies: '依赖',
  statistics: '统计',
  performance: '性能',
  monitors: '监视器',
  screenshot: '截图',
  screenshots: '截图',
  frame: '帧',
  frames: '帧',
  recording: '录制',
  properties: '属性',
  property: '属性',
  settings: '设置',
  setting: '设置',
  info: '信息',
  status: '状态',
  version: '版本',
  capabilities: '能力',
  debug: '调试',
  output: '输出',
  log: '日志',
  errors: '错误',
  signal: '信号',
  signals: '信号',
  group: '分组',
  groups: '分组',
  references: '引用',
  syntax: '语法',
  uid: 'UID',
  uids: 'UID',
  path: '路径',
  layout: '布局',
  bus: '总线',
  effect: '效果',
  layer: '层',
  layers: '层',
  raycast: 'RayCast',
  mesh: '网格',
  instance: '实例',
  gridmap: 'GridMap',
  stylebox: 'StyleBox',
  font: '字体',
  size: '大小',
  constant: '常量',
  color: '颜色',
  param: '参数',
  params: '参数',
  parameter: '参数',
  scenario: '场景测试',
  stress: '压力',
  report: '报告',
  nearby: '附近',
  navigate: '导航',
  wait: '等待',
  button: '按钮',
  text: '文本',
  screen: '屏幕',
  mouse: '鼠标',
  key: '按键',
  sequence: '序列',
  current: '当前',
  main: '主',
  custom: '自定义',
  all: '全部',
  type: '类型',
  circular: '循环',
  unused: '未使用',
  content: '内容',
  raw: '原始',
  fuzzy: '模糊',
  glob: 'glob',
  filtering: '过滤',
  viewport: '视口',
  autoload: '自动加载',
  autoloads: '自动加载',
  metadata: '元数据',
};

const EXACT_ZH = {
  get_project_info: '获取项目元数据、版本、视口和 autoload 信息。',
  project_get_settings: '读取 project.godot 设置。',
  project_set_setting: '更新 project.godot 设置，并提供 dry-run 预览和审计记录。',
  project_input_action: '列出或更新项目 InputMap 操作。',
  run_project_checks: '运行稳定的项目检查，用于 CI、评审和发布流程。',
  plugin_install: '把 godot-devtool WebSocket 编辑器/运行时插件安装到 Godot 项目。',
  plugin_status: '读取插件安装状态、WebSocket 配置和连接状态。',
  plugin_reload: '通过 WebSocket bridge 重载 godot-devtool 编辑器插件。',
  browser_visualizer_start: '启动本地只读 Browser visualizer 仪表盘。',
  browser_visualizer_status: '读取 Browser visualizer URL、项目过滤器和已连接 bridge client。',
  browser_visualizer_stop: '停止本地 Browser visualizer HTTP 仪表盘。',
  get_capabilities: '列出 MCP 工具能力、路由分组、传输方式和风险等级。',
  get_godot_version: '获取 Godot 可执行文件版本。',
  filesystem_read: '读取项目内 UTF-8 文本文件。',
  filesystem_write: '写入项目内 UTF-8 文本文件。',
  filesystem_list: '列出项目内文件和目录。',
  resource_dependency_graph: '构建资源依赖图并识别孤立资源。',
  get_script_index: '列出 GDScript 文件及类、基类、导出变量和函数信息。',
  get_scene_tree: '获取场景树结构。',
  create_scene: '创建新的 Godot 场景文件。',
  save_scene: '保存场景到磁盘。',
  get_game_scene_tree: '获取运行中游戏的场景树。',
  get_game_node_properties: '读取运行中游戏节点属性。',
  set_game_node_property: '写入运行中游戏节点属性。',
  get_game_screenshot: '截取运行中游戏画面。',
  get_editor_screenshot: '截取 Godot 编辑器画面。',
  generate_ci_snippet: '生成 GitHub Actions 或 GitLab CI 片段。',
};

function groupedTools() {
  const groups = new Map();
  for (const tool of GODOT_TOOL_DEFINITIONS) {
    const key = tool.routeGroup || 'compatibility';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tool);
  }
  for (const tools of groups.values()) tools.sort((a, b) => a.name.localeCompare(b.name));
  const keys = [
    ...GROUP_ORDER.filter((key) => groups.has(key)),
    ...[...groups.keys()].filter((key) => !GROUP_ORDER.includes(key)).sort(),
  ];
  return { groups, keys };
}

function cleanDescription(description) {
  return String(description || '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

function translateName(name) {
  const parts = name.split('_');
  const rest = ACTION_TOKENS.has(parts[0]) ? parts.slice(1) : parts;
  return rest.map((part) => TOKEN_ZH[part] || part).join('');
}

function translateDescription(tool) {
  if (EXACT_ZH[tool.name]) return EXACT_ZH[tool.name];
  const description = String(tool.description || '');
  const wrapper = description.match(/^Executable compatibility wrapper for ([^.]+)\./);
  if (wrapper) return `使用 \`${wrapper[1]}\` 实现执行同名 Godot 工作流，并返回结构化结果。`;
  const verb = TOKEN_ZH[tool.name.split('_')[0]] || '执行';
  return `${verb}${translateName(tool.name)}。`;
}

function renderTables({ zh }) {
  const { groups, keys } = groupedTools();
  const labels = zh ? ZH_GROUP_LABELS : EN_GROUP_LABELS;
  const lines = [zh ? `## 全部 ${GODOT_TOOL_DEFINITIONS.length} 个工具` : `## All ${GODOT_TOOL_DEFINITIONS.length} Tools`, ''];
  for (const key of keys) {
    const tools = groups.get(key);
    const label = labels[key] || `${key} Tools`;
    lines.push(`### ${label} (${tools.length})`);
    lines.push(zh ? '| 工具 | 描述 |' : '| Tool | Description |');
    lines.push('|------|-------------|');
    for (const tool of tools) {
      lines.push(`| \`${tool.name}\` | ${zh ? translateDescription(tool) : cleanDescription(tool.description)} |`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function replaceEnglish() {
  const content = readFileSync('README.md', 'utf8');
  const start = content.indexOf('## All ');
  const end = content.indexOf('## Which Route Should I Use?');
  if (start < 0 || end <= start) throw new Error('English all-tools block not found');
  writeFileSync('README.md', `${content.slice(0, start)}${renderTables({ zh: false })}\n\n${content.slice(end)}`, 'utf8');
}

function replaceChinese() {
  const content = readFileSync('README.zh-CN.md', 'utf8');
  const headings = [...content.matchAll(/^## .*/gm)].map((match) => ({ index: match.index, text: match[0] }));
  const start = headings.find((entry) => entry.text.includes('全部'));
  const end = headings.find((entry) => start && entry.index > start.index && entry.text.includes('路由'));
  if (!start) throw new Error('Chinese all-tools block not found');
  const endIndex = end?.index ?? content.length;
  writeFileSync('README.zh-CN.md', `${content.slice(0, start.index)}${renderTables({ zh: true })}\n\n${content.slice(endIndex)}`, 'utf8');
}

replaceEnglish();
replaceChinese();

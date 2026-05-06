import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createVisualToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    animation: (args) => host.handleP9SceneOperation('animation', args),
    animation_state_machine: (args) => host.handleP9SceneOperation('animation_state_machine', args),
    signal: (args) => host.handleP9SceneOperation('signal', args),
    group: (args) => host.handleP9SceneOperation('group', args),
    ui: (args) => host.handleP9SceneOperation('ui', args),
    material: (args) => host.handleP10VisualOperation('material', args),
    shader: (args) => host.handleP10VisualOperation('shader', args),
    lighting: (args) => host.handleP10VisualOperation('lighting', args),
    particle: (args) => host.handleP10VisualOperation('particle', args),
    tilemap: (args) => host.handleP11SceneOperation('tilemap', args),
    geometry: (args) => host.handleP11SceneOperation('geometry', args),
    physics: (args) => host.handleP11SceneOperation('physics', args),
    navigation: (args) => host.handleP11SceneOperation('navigation', args),
    audio: (args) => host.handleP11SceneOperation('audio', args),
  };
}

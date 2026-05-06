import type { ToolHandlerHost, ToolHandlerMap } from './types.js';

export function createScriptToolHandlers(host: ToolHandlerHost): ToolHandlerMap {
  return {
    script_create: (args) => host.handleScriptCreate(args),
    script_write: (args) => host.handleScriptWrite(args),
    script_attach: (args) => host.handleScriptAttach(args),
    read_script_file: (args) => host.handleReadScriptFile(args),
    analyze_script_references: (args) => host.handleAnalyzeScriptReferences(args),
    check_gdscript_syntax: (args) => host.handleCheckGDScriptSyntax(args),
  };
}

export type ToolHandler = (args: any) => Promise<any> | any;
export type ToolHandlerHostMethod = (...args: any[]) => Promise<any> | any;
export type ToolHandlerHost = Record<string, ToolHandlerHostMethod>;
export type ToolHandlerMap = Record<string, ToolHandler>;

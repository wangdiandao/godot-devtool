export type ToolHandlerHost = Record<string, any>;
export type ToolHandler = (args: any) => Promise<any> | any;
export type ToolHandlerMap = Record<string, ToolHandler>;

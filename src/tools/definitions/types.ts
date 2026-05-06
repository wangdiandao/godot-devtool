export type GodotToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * The public Cursor extension surface, copied from
 * https://cursor.com/docs/extension-api
 * Callers must feature-detect before use. No other Cursor methods are invoked.
 */
export interface CursorMcpApi {
  registerServer: (config: CursorMcpServerConfig) => void;
  unregisterServer: (serverName: string) => void;
}

export interface CursorPluginsApi {
  registerPath: (path: string) => void;
  unregisterPath: (path: string) => void;
}

export interface CursorExtensionApi {
  mcp?: CursorMcpApi;
  plugins: CursorPluginsApi;
}

export interface CursorStdioServerConfig {
  name: string;
  server: {
    command: string;
    args: string[];
    env: Record<string, string>;
  };
}

export interface CursorRemoteServerConfig {
  name: string;
  server: {
    url: string;
    headers?: Record<string, string>;
  };
}

export type CursorMcpServerConfig = CursorStdioServerConfig | CursorRemoteServerConfig;

export function readCursorApi(vscodeModule: unknown): CursorExtensionApi | undefined {
  if (!vscodeModule || typeof vscodeModule !== "object") {
    return undefined;
  }
  const cursor = (vscodeModule as { cursor?: Partial<CursorExtensionApi> }).cursor;
  if (!cursor) {
    return undefined;
  }
  const plugins = cursor.plugins;
  const mcp = cursor.mcp;
  if (!plugins?.registerPath || !plugins.unregisterPath || !mcp?.registerServer || !mcp.unregisterServer) {
    if (plugins?.registerPath && plugins.unregisterPath) {
      return {
        plugins: {
          registerPath: plugins.registerPath.bind(plugins),
          unregisterPath: plugins.unregisterPath.bind(plugins),
        },
      };
    }
    return undefined;
  }
  return {
    plugins: {
      registerPath: plugins.registerPath.bind(plugins),
      unregisterPath: plugins.unregisterPath.bind(plugins),
    },
    mcp: {
      registerServer: mcp.registerServer.bind(mcp),
      unregisterServer: mcp.unregisterServer.bind(mcp),
    },
  };
}

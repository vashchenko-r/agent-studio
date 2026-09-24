/**
 * Public Cursor extension API as documented at
 * https://cursor.com/docs/extension-api
 * Nothing beyond this module is called.
 */
declare module "vscode" {
  export namespace cursor {
    export namespace mcp {
      export interface StdioServerConfig {
        name: string;
        server: {
          command: string;
          args: string[];
          env: Record<string, string>;
        };
      }

      export interface RemoteServerConfig {
        name: string;
        server: {
          url: string;
          headers?: Record<string, string>;
        };
      }

      export type ExtMCPServerConfig = StdioServerConfig | RemoteServerConfig;

      export const registerServer: (config: ExtMCPServerConfig) => void;
      export const unregisterServer: (serverName: string) => void;
    }

    export namespace plugins {
      export const registerPath: (path: string) => void;
      export const unregisterPath: (path: string) => void;
    }
  }
}

/**
 * Figma bridge connection — connects to Figma Desktop via a lightweight
 * WebSocket server that the bridge plugin auto-discovers.
 *
 * Uses figma-console-mcp's FigmaWebSocketServer and WebSocketConnector
 * directly as a library — no MCP protocol overhead, no subprocess.
 *
 * The bridge plugin scans ports 9223-9232 at startup and connects to
 * all active servers. Gitma picks the next free port in that range.
 */

import { FigmaWebSocketServer } from "figma-console-mcp/dist/core/websocket-server.js";
import { WebSocketConnector } from "figma-console-mcp/dist/core/websocket-connector.js";
import { createServer, type Server } from "node:net";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FigmaConnection {
  server: InstanceType<typeof FigmaWebSocketServer>;
  connector: InstanceType<typeof WebSocketConnector>;
  /** File key of the currently open Figma file. */
  fileKey: string;
  /** Name of the currently open Figma file. */
  fileName: string;
}

// ---------------------------------------------------------------------------
// Port detection
// ---------------------------------------------------------------------------

const PORT_RANGE_START = 9223;
const PORT_RANGE_END = 9232;

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server: Server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "localhost");
  });
}

async function findFreePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(
    `No free ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}.\n` +
    "Close some figma-console instances and try again.",
  );
}

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

/**
 * Connect to Figma Desktop.
 *
 * Starts a lightweight WebSocket server on a free port in the
 * 9223-9232 range. The bridge plugin auto-discovers and connects.
 *
 * If the plugin was started before Gitma, the user needs to reload
 * the plugin so it discovers the new port.
 */
export async function connectToFigma(
  timeoutMs = 30_000,
): Promise<FigmaConnection> {
  const port = await findFreePort();
  const server = new FigmaWebSocketServer({ port, host: "localhost" });

  await server.start();

  const connector = new WebSocketConnector(server);

  // Wait for the plugin to connect
  const start = Date.now();
  const pollInterval = 500;

  while (Date.now() - start < timeoutMs) {
    if (server.isClientConnected()) {
      const fileInfo = server.getConnectedFileInfo();
      if (fileInfo?.fileKey) {
        return {
          server,
          connector,
          fileKey: fileInfo.fileKey,
          fileName: fileInfo.fileName ?? "",
        };
      }
    }
    await sleep(pollInterval);
  }

  await server.stop();

  const isPreferred = port === PORT_RANGE_START;
  if (isPreferred) {
    throw new Error(
      "Figma Desktop Bridge did not connect.\n" +
      "Make sure Figma Desktop is open and the bridge plugin is running.",
    );
  } else {
    throw new Error(
      `Gitma server started on port ${port} but the bridge plugin did not connect.\n` +
      "The plugin discovers servers at startup. Reload it in Figma:\n" +
      "  Plugins → Development → Figma Desktop Bridge",
    );
  }
}

/**
 * Disconnect and shut down the server.
 */
export async function disconnect(conn: FigmaConnection): Promise<void> {
  try {
    await conn.server.stop();
  } catch {
    // Ignore cleanup errors
  }
}

// ---------------------------------------------------------------------------
// Execution helpers
// ---------------------------------------------------------------------------

/**
 * Execute arbitrary JavaScript in Figma's plugin context.
 */
export async function executeInFigma<T = unknown>(
  conn: FigmaConnection,
  code: string,
  timeout = 10_000,
): Promise<T> {
  const raw = await conn.connector.executeCodeViaUI(code, timeout) as Record<string, unknown>;

  // Bridge wraps results as { success: true, result: <actual> }
  if (raw && typeof raw === "object" && "result" in raw) {
    if (raw.success === false) {
      throw new Error(`Figma execution failed: ${raw.error ?? "unknown error"}`);
    }
    return raw.result as T;
  }

  return raw as T;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

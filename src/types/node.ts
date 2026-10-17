/**
 * Configuration options for an axAudio voice node.
 */
export type NodeOptions = {
  /**
   * Unique identifier or label for this node (e.g. 'local-node', 'us-vps').
   */
  name: string;

  /**
   * Base HTTP URL of the axAudio node (e.g. 'http://127.0.0.1:2333').
   */
  url: string;

  /**
   * Optional authentication password for secured axAudio nodes (AXAUDIO_PASSWORD).
   * Forwarded as 'x-axaudio-password' header in HTTP requests and '?password=' query on WebSocket.
   */
  password?: string;

  /**
   * Automatically attempt reconnection if the WebSocket connection drops.
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Maximum reconnection attempts before giving up (-1 = infinite).
   * @default -1
   */
  reconnectAttempts?: number;

  /**
   * Initial reconnection interval in milliseconds.
   * @default 3000
   */
  reconnectInterval?: number;

  /**
   * Timeout in milliseconds for HTTP REST requests to the node.
   * @default 15000
   */
  requestTimeout?: number;
};

/**
 * Health and telemetry metrics returned by /v1/stats.
 */
export type NodeStats = {
  status: string;
  version: string;
  uptime_seconds: number;
  active_players: number;
};

/**
 * Standard axAudio API response wrapper.
 */
export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  message?: string | null;
};

/**
 * Configuración de un nodo axAudio.
 */
export type NodeOptions = {
  /**
   * Identificador único o etiqueta para este nodo (ej: 'local-node', 'us-vps').
   */
  name: string;

  /**
   * URL HTTP base del nodo axAudio (ej: 'http://127.0.0.1:2333' o 'http://100.108.121.22:3000').
   */
  url: string;

  /**
   * Intenta reconectar automáticamente si el socket WebSocket se interrumpe.
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Cantidad máxima de reintentos de reconexión antes de marcar el nodo como inactivo (-1 = infinito).
   * @default -1
   */
  reconnectAttempts?: number;

  /**
   * Intervalo inicial de reconexión en milisegundos.
   * @default 3000
   */
  reconnectInterval?: number;

  /**
   * Timeout en milisegundos para peticiones HTTP al nodo.
   * @default 15000
   */
  requestTimeout?: number;
};

/**
 * Métricas de salud y rendimiento retornadas por /v1/stats.
 */
export type NodeStats = {
  status: string;
  version: string;
  uptime_seconds: number;
  active_players: number;
};

/**
 * Envoltorio estándar de respuesta de axAudio.
 */
export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  message?: string | null;
};

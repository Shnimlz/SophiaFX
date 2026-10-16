import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type {
  NodeOptions,
  NodeStats,
  ApiResponse,
  Track,
  PlayOptions,
  PlayResponse,
  QueueResponse,
  ControlAction,
  VoiceConnectionInfo,
  SearchOptions,
  SearchResponse,
  BandSetting,
  SpatialSettings,
  DspResponse,
  RawPlayerEvent
} from './types/index.js';

export type NodeEvents = {
  connect: (node: Node) => void;
  disconnect: (node: Node, code: number, reason: string) => void;
  error: (node: Node, error: Error) => void;
  trackStart: (guildId: string, track: Track) => void;
  trackEnd: (guildId: string, track: Track | null, reason: string) => void;
  trackError: (guildId: string, track: Track | null, error: string) => void;
};

/**
 * Representa una conexión activa a un nodo de audio axAudio.
 */
export class Node extends EventEmitter {
  public readonly name: string;
  public readonly url: string;
  public readonly wsUrl: string;
  public readonly options: NodeOptions;

  public connected = false;
  public stats: NodeStats | null = null;

  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private destroyed = false;

  constructor(options: NodeOptions) {
    super();
    this.name = options.name;
    this.options = options;

    // Normalizar URLs
    let baseUrl = options.url.trim();

    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    this.url = baseUrl;

    const parsed = new URL(baseUrl);
    const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    this.wsUrl = `${wsProto}//${parsed.host}/v1/events`;
  }

  /**
   * Conecta al bus WebSocket /v1/events del nodo axAudio.
   */
  public connect(): void {
    if (this.destroyed) return;
    this.cleanupSocket();

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connect', this);
        this.fetchStats().catch(() => {});
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code: number, reasonBuffer: Buffer) => {
        const reason = reasonBuffer.toString('utf-8');
        this.connected = false;
        this.emit('disconnect', this, code, reason);
        this.scheduleReconnect();
      });

      this.ws.on('error', (err: Error) => {
        this.emit('error', this, err);
      });

      this.ws.on('ping', (payload: Buffer) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.pong(payload);
        }
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', this, error);
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const parsed: RawPlayerEvent = JSON.parse(data.toString());
      const guildId = String(parsed.guild_id);

      switch (parsed.type) {
        case 'track_start':
          this.emit('trackStart', guildId, parsed.track);
          break;
        case 'track_end':
          this.emit('trackEnd', guildId, parsed.track, parsed.reason);
          break;
        case 'track_error':
          this.emit('trackError', guildId, parsed.track, parsed.error);
          break;
      }
    } catch {
      // Ignorar mensajes malformados o no JSON
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.options.autoReconnect === false) return;

    const maxAttempts = this.options.reconnectAttempts ?? -1;

    if (maxAttempts !== -1 && this.reconnectAttempts >= maxAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min((this.options.reconnectInterval ?? 3000) * Math.min(this.reconnectAttempts, 5), 30000);

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private cleanupSocket(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.on('error', () => {});

      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {}

      this.ws = null;
    }
  }

  /**
   * Ejecuta una petición HTTP genérica al nodo axAudio.
   */
  public async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const targetUrl = `${this.url}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const timeoutMs = this.options.requestTimeout ?? 15000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(targetUrl, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...options.headers
        }
      });

      // SAFETY: axAudio HTTP endpoints always return a serialized ApiResponse<T> JSON structure
      const body = (await res.json().catch(() => ({
        success: false,
        data: null,
        message: `HTTP ${res.status}: Respuesta no JSON de axAudio`
      }))) as ApiResponse<T>;

      if (!res.ok || !body.success) {
        throw new Error(body.message || `axAudio request failed with status ${res.status}`);
      }

      // SAFETY: when body.success is true, data contains payload of type T
      return body.data as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Obtiene telemetría y métricas del nodo axAudio.
   */
  public async fetchStats(): Promise<NodeStats> {
    const stats = await this.request<NodeStats>('/v1/stats', { method: 'GET' });
    this.stats = stats;

    return stats;
  }

  /**
   * Realiza un healthcheck HTTP al nodo.
   */
  public async health(): Promise<string> {
    return this.request<string>('/health', { method: 'GET' });
  }

  /**
   * Envía las credenciales de voz a axAudio para establecer la conexión UDP RTP de Songbird.
   */
  public async joinVoice(voiceInfo: VoiceConnectionInfo): Promise<string> {
    return this.request<string>('/v1/voice/join', {
      method: 'POST',
      body: JSON.stringify(voiceInfo)
    });
  }

  /**
   * Desconecta el driver de voz y limpia la sesión del guild en el nodo.
   */
  public async leaveVoice(guildId: string): Promise<string> {
    return this.request<string>('/v1/voice/leave', {
      method: 'POST',
      body: JSON.stringify({ guild_id: guildId })
    });
  }

  /**
   * Encola y reproduce una pista o lista en axAudio.
   */
  public async play(guildId: string, url: string, options: PlayOptions = {}): Promise<PlayResponse> {
    return this.request<PlayResponse>('/v1/player/play', {
      method: 'POST',
      body: JSON.stringify({
        guild_id: guildId,
        url,
        volume: options.volume,
        replace: options.replace,
        extractor_args: options.extractor_args,
        extra_args: options.extra_args,
        cookies: options.cookies,
        format: options.format
      })
    });
  }

  /**
   * Ejecuta una acción de control inmediata (pause, resume, stop, skip, clear, volume).
   */
  public async control(guildId: string, action: ControlAction, value?: number): Promise<string> {
    return this.request<string>('/v1/player/control', {
      method: 'POST',
      body: JSON.stringify({
        guild_id: guildId,
        action,
        value: action === 'volume' ? value : undefined
      })
    });
  }

  /**
   * Consulta el estado de la cola y la pista en curso.
   */
  public async getQueue(guildId: string): Promise<QueueResponse> {
    return this.request<QueueResponse>('/v1/player/queue', {
      method: 'POST',
      body: JSON.stringify({ guild_id: guildId })
    });
  }

  /**
   * Modifica el ecualizador de 15 bandas o aplica un preset acústico.
   */
  public async setEq(guildId: string, bands?: BandSetting[], preset?: string): Promise<DspResponse> {
    return this.request<DspResponse>('/v1/player/eq', {
      method: 'POST',
      body: JSON.stringify({
        guild_id: guildId,
        bands,
        preset
      })
    });
  }

  /**
   * Modifica parámetros avanzados de DSP (espacialización Mid/Side 3D, crossfeed, excitador).
   */
  public async setDsp(
    guildId: string,
    options: {
      preset?: string;
      spatial?: SpatialSettings;
      bands?: BandSetting[];
    }
  ): Promise<DspResponse> {
    return this.request<DspResponse>('/v1/player/dsp', {
      method: 'POST',
      body: JSON.stringify({
        guild_id: guildId,
        preset: options.preset,
        spatial: options.spatial,
        bands: options.bands
      })
    });
  }

  /**
   * Resuelve metadatos y stream CDN de una URL sin encolar.
   */
  public async resolveTrack(query: string, options: Partial<PlayOptions> = {}): Promise<Track> {
    return this.request<Track>('/v1/tracks/resolve', {
      method: 'POST',
      body: JSON.stringify({
        query,
        extractor_args: options.extractor_args,
        extra_args: options.extra_args,
        cookies: options.cookies,
        format: options.format
      })
    });
  }

  /**
   * Busca pistas en YouTube o SoundCloud mediante axAudio.
   */
  public async searchTracks(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    return this.request<SearchResponse>('/v1/tracks/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        limit: options.limit ?? 5,
        source: options.source ?? 'auto',
        extractor_args: options.extractor_args,
        extra_args: options.extra_args,
        cookies: options.cookies
      })
    });
  }

  /**
   * Destruye la conexión y cancela reconexiones automáticas.
   */
  public destroy(): void {
    this.destroyed = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.cleanupSocket();
    this.removeAllListeners();
  }
}

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
 * Represents an active connection to an axAudio voice node.
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

    // Normalize URLs
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
   * Connects to the /v1/events WebSocket bus of the axAudio node.
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
      // Ignore malformed or non-JSON messages
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
   * Executes a generic HTTP request against the axAudio node.
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
        message: `HTTP ${res.status}: Non-JSON response from axAudio`
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
   * Fetches telemetry and resource metrics from the axAudio node.
   */
  public async fetchStats(): Promise<NodeStats> {
    const stats = await this.request<NodeStats>('/v1/stats', { method: 'GET' });
    this.stats = stats;

    return stats;
  }

  /**
   * Performs an HTTP health check on the node.
   */
  public async health(): Promise<string> {
    return this.request<string>('/health', { method: 'GET' });
  }

  /**
   * Forwards voice credentials to axAudio to establish the Songbird UDP RTP stream.
   */
  public async joinVoice(voiceInfo: VoiceConnectionInfo): Promise<string> {
    return this.request<string>('/v1/voice/join', {
      method: 'POST',
      body: JSON.stringify(voiceInfo)
    });
  }

  /**
   * Disconnects the voice driver and clears the guild session on the node.
   */
  public async leaveVoice(guildId: string): Promise<string> {
    return this.request<string>('/v1/voice/leave', {
      method: 'POST',
      body: JSON.stringify({ guild_id: guildId })
    });
  }

  /**
   * Enqueues and plays a track or playlist URL in axAudio.
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
   * Executes an immediate player control action (pause, resume, stop, skip, clear, volume).
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
   * Queries the current player queue and playing track state.
   */
  public async getQueue(guildId: string): Promise<QueueResponse> {
    return this.request<QueueResponse>('/v1/player/queue', {
      method: 'POST',
      body: JSON.stringify({ guild_id: guildId })
    });
  }

  /**
   * Modifies the 15-band equalizer gains or applies an acoustic preset.
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
   * Modifies advanced DSP parameters (Mid/Side 3D spatial widening, crossfeed, exciter).
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
   * Resolves track metadata and audio CDN stream for a URL without enqueueing.
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
   * Searches for tracks across YouTube or SoundCloud via axAudio.
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
   * Destroys the node connection and cancels pending reconnection timers.
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

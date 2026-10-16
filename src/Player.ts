import { EventEmitter } from 'node:events';
import type { Node } from './Node.js';
import type { SophiaFX } from './SophiaFX.js';
import type {
  Track,
  PlayOptions,
  PlayResponse,
  QueueResponse,
  BandSetting,
  SpatialSettings,
  DspStatus,
  DspResponse,
  PresetName
} from './types/index.js';

import {
  isVoiceServerPacket,
  isVoiceStatePacket,
  type DiscordGatewayPacket
} from './connectors/Connector.js';

export type ConnectOptions = {
  selfMute?: boolean;
  selfDeaf?: boolean;
  timeoutMs?: number;
};

type PendingVoiceInfo = {
  sessionId: string;
  token: string;
  endpoint: string;
};

type PendingHandshakeState = {
  resolve: (info: PendingVoiceInfo) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  sessionId?: string;
  serverUpdate?: { token: string; endpoint: string };
};

/**
 * Real-time audio and playback controller for a guild.
 */
export class Player extends EventEmitter {
  public readonly sophia: SophiaFX;
  public readonly guildId: string;
  public node: Node;

  public channelId: string | null = null;
  public isPlaying = false;
  public isPaused = false;
  public volume = 1.0;
  public current: Track | null = null;
  public queue: Track[] = [];
  public dspStatus: DspStatus | null = null;

  // Pending voice handshake state
  private pendingVoiceHandshake: PendingHandshakeState | null = null;

  constructor(sophia: SophiaFX, node: Node, guildId: string) {
    super();
    this.sophia = sophia;
    this.node = node;
    this.guildId = guildId;
  }

  /**
   * Connects the player to a Discord voice channel using the gateway and Songbird driver.
   */
  public async connect(channelId: string, options: ConnectOptions = {}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 15000;
    const botId = this.sophia.connector.getBotId();

    // Preventive reset: enforce voice leave to renew Discord handshakes upon reconnect
    this.sophia.connector.sendVoiceUpdate(this.guildId, null, false, false);
    await new Promise((r) => setTimeout(r, 250));

    const voiceInfo = await new Promise<PendingVoiceInfo>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingVoiceHandshake = null;
        reject(
          new Error(
            `[SophiaFX/Player] Timeout (${timeoutMs}ms) waiting for Discord voice handshakes (VOICE_SERVER_UPDATE)`
          )
        );
      }, timeoutMs);

      this.pendingVoiceHandshake = {
        resolve,
        reject,
        timer
      };

      // Emit OpCode 4 voice update to Discord Gateway
      this.sophia.connector.sendVoiceUpdate(
        this.guildId,
        channelId,
        options.selfMute ?? false,
        options.selfDeaf ?? false
      );
    });

    // Forward voice credentials to axAudio
    await this.node.joinVoice({
      guild_id: this.guildId,
      channel_id: channelId,
      session_id: voiceInfo.sessionId,
      token: voiceInfo.token,
      endpoint: voiceInfo.endpoint,
      user_id: botId
    });

    this.channelId = channelId;
  }

  /**
   * Processes raw voice packets intercepted by the connector.
   * @internal
   */
  public handleRawVoicePacket(packet: DiscordGatewayPacket): void {
    if (!this.pendingVoiceHandshake) return;

    if (isVoiceStatePacket(packet)) {
      const d = packet.d;

      if (d.guild_id === this.guildId && d.user_id === this.sophia.connector.getBotId()) {
        if (d.channel_id && d.session_id) {
          this.pendingVoiceHandshake.sessionId = d.session_id;
          this.checkHandshakeComplete();
        }
      }
    } else if (isVoiceServerPacket(packet)) {
      const d = packet.d;

      if (d.guild_id === this.guildId) {
        if (d.token && d.endpoint) {
          this.pendingVoiceHandshake.serverUpdate = {
            token: d.token,
            endpoint: d.endpoint
          };
          this.checkHandshakeComplete();
        }
      }
    }
  }

  private checkHandshakeComplete(): void {
    if (
      this.pendingVoiceHandshake &&
      this.pendingVoiceHandshake.sessionId &&
      this.pendingVoiceHandshake.serverUpdate
    ) {
      clearTimeout(this.pendingVoiceHandshake.timer);
      const resolve = this.pendingVoiceHandshake.resolve;

      const data = {
        sessionId: this.pendingVoiceHandshake.sessionId,
        token: this.pendingVoiceHandshake.serverUpdate.token,
        endpoint: this.pendingVoiceHandshake.serverUpdate.endpoint
      };

      this.pendingVoiceHandshake = null;
      resolve(data);
    }
  }

  /**
   * Enqueues and plays a song or playlist in axAudio.
   */
  public async play(url: string, options: PlayOptions = {}): Promise<PlayResponse> {
    const res = await this.node.play(this.guildId, url, options);
    this.isPlaying = true;
    this.isPaused = false;

    if (options.volume !== undefined) {
      this.volume = options.volume;
    }

    return res;
  }

  /**
   * Pauses active audio playback.
   */
  public async pause(): Promise<void> {
    await this.node.control(this.guildId, 'pause');
    this.isPaused = true;
  }

  /**
   * Resumes paused playback.
   */
  public async resume(): Promise<void> {
    await this.node.control(this.guildId, 'resume');
    this.isPaused = false;
  }

  /**
   * Stops playback, clears the queue, and cancels background playlist loaders.
   */
  public async stop(): Promise<void> {
    await this.node.control(this.guildId, 'stop');
    this.isPlaying = false;
    this.isPaused = false;
    this.current = null;
    this.queue = [];
  }

  /**
   * Skips to the next track immediately.
   */
  public async skip(): Promise<void> {
    await this.node.control(this.guildId, 'skip');
  }

  /**
   * Clears pending queued tracks while preserving the currently playing track.
   */
  public async clearQueue(): Promise<void> {
    await this.node.control(this.guildId, 'clear');
    this.queue = [];
  }

  /**
   * Adjusts the player volume (0.0 to 2.0).
   */
  public async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0.0, Math.min(2.0, volume));
    await this.node.control(this.guildId, 'volume', clamped);
    this.volume = clamped;
  }

  /**
   * Queries the synchronized queue state from axAudio.
   */
  public async getQueue(): Promise<QueueResponse> {
    const res = await this.node.getQueue(this.guildId);
    this.isPlaying = res.is_playing;
    this.current = res.current;
    this.queue = res.queue;

    return res;
  }

  /**
   * Applies a calibrated acoustic preset (e.g. 'music', 'cinema-3d', 'bass-boost-3d').
   */
  public async setPreset(preset: PresetName): Promise<DspResponse> {
    const res = await this.node.setEq(this.guildId, undefined, preset);
    this.dspStatus = res.status;

    return res;
  }

  /**
   * Configures custom band gains on the 15-band graphic equalizer.
   */
  public async setEqualizer(bands: BandSetting[]): Promise<DspResponse> {
    const res = await this.node.setEq(this.guildId, bands);
    this.dspStatus = res.status;

    return res;
  }

  /**
   * Configures advanced 3D spatial widening and psychoacoustic parameters.
   */
  public async setSpatial(spatial: SpatialSettings): Promise<DspResponse> {
    const res = await this.node.setDsp(this.guildId, { spatial });
    this.dspStatus = res.status;

    return res;
  }

  /**
   * Resets the equalizer and spatializer to transparent (flat) response.
   */
  public async resetDsp(): Promise<DspResponse> {
    return this.setPreset('flat');
  }

  /**
   * Disconnects the bot from voice and destroys this Player instance.
   */
  public async disconnect(): Promise<void> {
    try {
      await this.node.leaveVoice(this.guildId);
    } catch {}

    try {
      this.sophia.connector.sendVoiceUpdate(this.guildId, null, false, false);
    } catch {}

    this.channelId = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.current = null;
    this.queue = [];

    this.emit('destroy');
    this.sophia.destroyPlayer(this.guildId);
  }

  /**
   * Internal events forwarded from the axAudio node.
   * @internal
   */
  public emitTrackStart(track: Track): void {
    this.isPlaying = true;
    this.isPaused = false;
    this.current = track;
    this.emit('trackStart', track);
  }

  /**
   * @internal
   */
  public emitTrackEnd(track: Track | null, reason: string): void {
    this.isPlaying = false;
    this.current = null;
    this.emit('trackEnd', track, reason);
  }

  /**
   * @internal
   */
  public emitTrackError(track: Track | null, error: string): void {
    this.emit('trackError', track, error);
  }
}

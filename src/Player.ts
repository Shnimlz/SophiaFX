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

export interface ConnectOptions {
  selfMute?: boolean;
  selfDeaf?: boolean;
  timeoutMs?: number;
}

/**
 * Controlador de reproducción y audio en tiempo real para un Guild.
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

  // Manejo de promesa pendiente de handshake
  private pendingVoiceHandshake: {
    resolve: (info: any) => void;
    reject: (err: any) => void;
    timer: NodeJS.Timeout;
    sessionId?: string;
    serverUpdate?: { token: string; endpoint: string };
  } | null = null;

  constructor(sophia: SophiaFX, node: Node, guildId: string) {
    super();
    this.sophia = sophia;
    this.node = node;
    this.guildId = guildId;
  }

  /**
   * Conecta el reproductor a un canal de voz de Discord mediante el gateway y el driver Songbird.
   */
  public async connect(channelId: string, options: ConnectOptions = {}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 15000;
    const botId = this.sophia.connector.getBotId();

    // Reset preventivo: forzar salida previa para renovar handshakes en caso de reconexión
    this.sophia.connector.sendVoiceUpdate(this.guildId, null, false, false);
    await new Promise((r) => setTimeout(r, 250));

    const voiceInfo = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingVoiceHandshake = null;
        reject(new Error(`[SophiaFX/Player] Timeout (${timeoutMs}ms) esperando handshakes de voz de Discord (VOICE_SERVER_UPDATE)`));
      }, timeoutMs);

      this.pendingVoiceHandshake = {
        resolve,
        reject,
        timer
      };

      // Emitir OpCode 4 a Discord
      this.sophia.connector.sendVoiceUpdate(
        this.guildId,
        channelId,
        options.selfMute ?? false,
        options.selfDeaf ?? false
      );
    });

    // Enviar credenciales a axAudio
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
   * Procesa paquetes raw de voz interceptados por el conector.
   * @internal
   */
  public handleRawVoicePacket(packet: any): void {
    if (!this.pendingVoiceHandshake || !packet.d) return;

    if (packet.t === 'VOICE_STATE_UPDATE') {
      const d = packet.d;
      if (d.guild_id === this.guildId && d.user_id === this.sophia.connector.getBotId()) {
        if (d.channel_id && d.session_id) {
          this.pendingVoiceHandshake.sessionId = d.session_id;
          this.checkHandshakeComplete();
        }
      }
    } else if (packet.t === 'VOICE_SERVER_UPDATE') {
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
   * Encola y reproduce una canción o playlist en axAudio.
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
   * Pausa la reproducción activa.
   */
  public async pause(): Promise<void> {
    await this.node.control(this.guildId, 'pause');
    this.isPaused = true;
  }

  /**
   * Reanuda la reproducción pausada.
   */
  public async resume(): Promise<void> {
    await this.node.control(this.guildId, 'resume');
    this.isPaused = false;
  }

  /**
   * Detiene la reproducción, limpia la cola y cancela cargadores de playlists en segundo plano.
   */
  public async stop(): Promise<void> {
    await this.node.control(this.guildId, 'stop');
    this.isPlaying = false;
    this.isPaused = false;
    this.current = null;
    this.queue = [];
  }

  /**
   * Salta a la siguiente pista inmediatamente.
   */
  public async skip(): Promise<void> {
    await this.node.control(this.guildId, 'skip');
  }

  /**
   * Vacía las pistas en cola conservando la canción que suena en este momento.
   */
  public async clearQueue(): Promise<void> {
    await this.node.control(this.guildId, 'clear');
    this.queue = [];
  }

  /**
   * Ajusta el volumen del reproductor (0.0 a 2.0).
   */
  public async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0.0, Math.min(2.0, volume));
    await this.node.control(this.guildId, 'volume', clamped);
    this.volume = clamped;
  }

  /**
   * Consulta el estado de la cola sincronizado con axAudio.
   */
  public async getQueue(): Promise<QueueResponse> {
    const res = await this.node.getQueue(this.guildId);
    this.isPlaying = res.is_playing;
    this.current = res.current;
    this.queue = res.queue;
    return res;
  }

  /**
   * Aplica un preset acústico calibrado (ej: 'music', 'cinema-3d', 'bass-boost-3d').
   */
  public async setPreset(preset: PresetName): Promise<DspResponse> {
    const res = await this.node.setEq(this.guildId, undefined, preset);
    this.dspStatus = res.status;
    return res;
  }

  /**
   * Configura ganancias personalizadas en el ecualizador gráfico de 15 bandas.
   */
  public async setEqualizer(bands: BandSetting[]): Promise<DspResponse> {
    const res = await this.node.setEq(this.guildId, bands);
    this.dspStatus = res.status;
    return res;
  }

  /**
   * Configura parámetros avanzados de procesamiento espacial 3D y psychoacoustics.
   */
  public async setSpatial(spatial: SpatialSettings): Promise<DspResponse> {
    const res = await this.node.setDsp(this.guildId, { spatial });
    this.dspStatus = res.status;
    return res;
  }

  /**
   * Restaura el ecualizador y el espacializador a modo plano / transparente (Flat).
   */
  public async resetDsp(): Promise<DspResponse> {
    return this.setPreset('flat');
  }

  /**
   * Desconecta al bot del canal de voz y destruye la instancia de este Player.
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
   * Eventos internos emitidos desde el nodo axAudio.
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

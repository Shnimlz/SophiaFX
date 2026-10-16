import { EventEmitter } from 'node:events';

export interface VoiceServerUpdatePacket {
  token: string;
  guild_id: string;
  endpoint: string;
}

export interface VoiceStateUpdatePacket {
  guild_id: string;
  channel_id: string | null;
  user_id: string;
  session_id: string;
}

export interface DiscordGatewayPacket {
  op?: number;
  t?: string;
  d?: any;
}

/**
 * Interfaz base para conectar SophiaFX con cualquier cliente de Discord (discord.js, oceanic, eris o websocket raw).
 */
export abstract class Connector extends EventEmitter {
  /**
   * Obtiene el ID del bot conectado.
   */
  abstract getBotId(): string;

  /**
   * Envía un paquete OpCode 4 a Discord Gateway para solicitar unirse o salir de voz.
   */
  abstract sendVoiceUpdate(guildId: string, channelId: string | null, selfMute?: boolean, selfDeaf?: boolean): void;

  /**
   * Inicializa la escucha de eventos raw del gateway.
   */
  abstract listen(callback: (packet: DiscordGatewayPacket) => void): void;

  /**
   * Limpia los listeners asignados al cliente.
   */
  abstract destroy(): void;
}

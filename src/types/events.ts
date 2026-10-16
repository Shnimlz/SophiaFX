import type { Track } from './player.js';

/**
 * Paquete de evento WebSocket enviado por /v1/events en axAudio.
 */
export type RawPlayerEvent =
  | {
      type: 'track_start';
      guild_id: number | string;
      track: Track;
    }
  | {
      type: 'track_end';
      guild_id: number | string;
      track: Track | null;
      reason: string;
    }
  | {
      type: 'track_error';
      guild_id: number | string;
      track: Track | null;
      error: string;
    };

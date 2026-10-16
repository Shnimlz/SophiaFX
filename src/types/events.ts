import type { Track } from './player.js';

/**
 * Raw WebSocket event packet broadcast by axAudio over /v1/events.
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

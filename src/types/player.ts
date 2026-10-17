/**
 * Metadata representing an audio track in axAudio.
 */
export type Track = {
  title: string;
  source_url: string;
  stream_url: string;
  duration_secs: number | null;
  author: string | null;
  thumbnail: string | null;
};

/**
 * Flat representation of a playlist item during fast-start asynchronous loading.
 */
export type FlatPlaylistItem = {
  title: string;
  url: string;
  duration_secs: number | null;
  author: string | null;
  thumbnail: string | null;
};

/**
 * Options for enqueueing or playing an audio track or playlist in axAudio.
 */
export type PlayOptions = {
  /**
   * Initial volume for playback (0.0 to 2.0).
   * @default 1.0
   */
  volume?: number;

  /**
   * If true, stops the active track immediately, aborts background playlist fetchers,
   * and replaces the entire queue.
   * @default false
   */
  replace?: boolean;

  /**
   * Extractor arguments forwarded to yt-dlp (e.g. 'youtube:player_client=web_creator').
   */
  extractor_args?: string;

  /**
   * Additional CLI arguments passed to yt-dlp.
   */
  extra_args?: string;

  /**
   * Explicit path to a Netscape cookies text file.
   */
  cookies?: string;

  /**
   * Custom format selector for yt-dlp (e.g. 'ba[format_id=251]/bestaudio').
   */
  format?: string;
};

/**
 * Response returned by axAudio from /v1/player/play.
 * Composes the base Track type with batch and playlist telemetry.
 */
export type PlayResponse = Track & {
  is_playlist: boolean;
  playlist_title: string | null;
  playlist_tracks_count: number;
  queue_length: number;
  was_empty: boolean;
};

/**
 * Loop modes supported by axAudio.
 */
export type LoopMode = 'off' | 'track' | 'queue';

/**
 * Queue and playback status for a Discord guild.
 */
export type QueueResponse = {
  guild_id: string;
  is_playing: boolean;
  current: Track | null;
  current_position_secs?: number | null;
  loop_mode: LoopMode;
  queue: Track[];
  total_tracks: number;
};

/**
 * Immediate player control operations for /v1/player/control.
 */
export type ControlAction =
  | 'pause'
  | 'resume'
  | 'stop'
  | 'skip'
  | 'clear'
  | 'volume'
  | 'seek'
  | 'loop'
  | 'shuffle'
  | 'remove'
  | 'move';

/**
 * Parameters for player control operations.
 */
export type ControlOptions = {
  value?: number;
  position_secs?: number;
  mode?: LoopMode | string;
  index?: number;
  from_index?: number;
  to_index?: number;
};

/**
 * Discord Voice Gateway credentials required for the Songbird UDP driver handshake.
 */
export type VoiceConnectionInfo = {
  guild_id: string;
  channel_id: string;
  session_id: string;
  token: string;
  endpoint: string;
  user_id: string;
};

export type SearchOptions = {
  limit?: number;
  source?: 'auto' | 'youtube' | 'soundcloud';
  extractor_args?: string;
  extra_args?: string;
  cookies?: string;
};

export type SearchResponse = {
  query: string;
  source_used: string;
  tracks: FlatPlaylistItem[];
};

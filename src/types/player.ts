/**
 * Metadatos de una pista de audio en axAudio.
 */
export interface Track {
  title: string;
  source_url: string;
  stream_url: string;
  duration_secs: number | null;
  author: string | null;
  thumbnail: string | null;
}

/**
 * Elemento plano de una lista de reproducción en proceso de carga.
 */
export interface FlatPlaylistItem {
  title: string;
  url: string;
  duration_secs: number | null;
  author: string | null;
  thumbnail: string | null;
}

/**
 * Opciones para encolar o reproducir una pista en axAudio.
 */
export interface PlayOptions {
  /**
   * Volumen inicial del reproductor (0.0 a 2.0).
   * @default 1.0
   */
  volume?: number;

  /**
   * Si es true, detiene inmediatamente la pista activa, cancela trabajadores
   * de playlist en segundo plano y reemplaza la cola completa.
   * @default false
   */
  replace?: boolean;

  /**
   * Argumentos de extractor para yt-dlp (ej: 'youtube:player_client=web_creator').
   */
  extractor_args?: string;

  /**
   * Argumentos CLI adicionales para yt-dlp.
   */
  extra_args?: string;

  /**
   * Ruta explícita a un archivo de cookies Netscape.
   */
  cookies?: string;

  /**
   * Selector de formato yt-dlp (ej: 'ba[format_id=251]/bestaudio').
   */
  format?: string;
}

/**
 * Respuesta devuelta por axAudio tras invocar /v1/player/play.
 */
export interface PlayResponse extends Track {
  is_playlist: boolean;
  playlist_title: string | null;
  playlist_tracks_count: number;
  queue_length: number;
  was_empty: boolean;
}

/**
 * Representación del estado de la cola de reproducción en un guild.
 */
export interface QueueResponse {
  guild_id: string;
  is_playing: boolean;
  current: Track | null;
  queue: Track[];
  total_tracks: number;
}

/**
 * Acciones de control inmediato de reproducción en /v1/player/control.
 */
export type ControlAction = 'pause' | 'resume' | 'stop' | 'skip' | 'clear' | 'volume';

/**
 * Credenciales de Discord Voice Gateway requeridas para el handshake del driver.
 */
export interface VoiceConnectionInfo {
  guild_id: string;
  channel_id: string;
  session_id: string;
  token: string;
  endpoint: string;
  user_id: string;
}

export interface SearchOptions {
  limit?: number;
  source?: 'auto' | 'youtube' | 'soundcloud';
  extractor_args?: string;
  extra_args?: string;
  cookies?: string;
}

export interface SearchResponse {
  query: string;
  source_used: string;
  tracks: FlatPlaylistItem[];
}

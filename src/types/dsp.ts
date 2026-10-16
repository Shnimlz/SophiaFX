/**
 * Standard ISO center frequencies for the 15-band graphic equalizer.
 */
export const EQ_FREQUENCIES = [
  25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000
] as const;

export type EqFrequency = (typeof EQ_FREQUENCIES)[number];

/**
 * Gain setting for an individual band index (0 to 14).
 * Accepts direct dB (-15.0 to +15.0) or Lavalink linear gain scale (-0.5 to +1.0).
 */
export type BandSetting = {
  band: number;
  gain: number;
};

/**
 * Real-time 3D acoustic modeling and psychoacoustic spatial parameters.
 */
export type SpatialSettings = {
  /**
   * Stereo field width of the Mid/Side matrix:
   * 0.0 (Mono), 1.0 (Normal / Transparent), 1.35 (3D Immersion), 2.0 (Ultra-Wide).
   * @default 1.0
   */
  stereo_width?: number;

  /**
   * Enables head-shadow natural acoustic crossfeed (700Hz delay without comb filtering).
   * Drastically reduces listening fatigue on headphones.
   * @default false
   */
  binaural_crossfeed?: boolean;

  /**
   * Crossfeed blend level (0.0 to 0.40).
   * @default 0.18
   */
  crossfeed_level?: number;

  /**
   * Enables sub-bass harmonic exciter (< 85Hz).
   * Generates warm musical harmonics for headphones and compact speakers.
   * @default false
   */
  bass_exciter?: boolean;

  /**
   * Harmonic saturation drive intensity (0.0 to 1.0).
   * @default 0.35
   */
  bass_exciter_drive?: number;
};

/**
 * Pre-calibrated studio acoustic presets in axAudio.
 */
export type PresetName =
  | 'music'
  | 'cinema-3d'
  | 'bass-boost-3d'
  | 'vocal-clarity'
  | 'gaming-3d'
  | 'concert-hall'
  | 'flat';

/**
 * Telemetry representation of the current DSP engine state.
 */
export type DspStatus = {
  active_preset: string | null;
  stereo_width: number;
  binaural_crossfeed: boolean;
  bass_exciter: boolean;
  eq_bands: number[];
};

export type DspPayload = {
  guild_id: string;
  preset?: string | null;
  spatial?: SpatialSettings | null;
  bands?: BandSetting[] | null;
};

export type DspResponse = {
  guild_id: string;
  status: DspStatus;
  message: string;
};

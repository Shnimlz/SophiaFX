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
 * Dynamic spatial modulation and modulation effects (8D Orbital Rotation, Tremolo, Vibrato).
 */
export type ModulationSettings = {
  /**
   * Continuous 8D orbital spatial rotation around the listener.
   * @default false
   */
  rotation?: boolean;

  /**
   * Orbital rotation cycle speed in Hz (0.01 to 2.0 Hz).
   * @default 0.15
   */
  rotation_speed_hz?: number;

  /**
   * Amplitude modulation tremolo effect.
   * @default false
   */
  tremolo?: boolean;

  /**
   * Tremolo LFO frequency in Hz (0.1 to 20.0 Hz).
   * @default 4.0
   */
  tremolo_freq_hz?: number;

  /**
   * Tremolo depth factor (0.0 to 1.0).
   * @default 0.5
   */
  tremolo_depth?: number;

  /**
   * Frequency modulation vibrato effect.
   * @default false
   */
  vibrato?: boolean;

  /**
   * Vibrato LFO frequency in Hz (0.1 to 14.0 Hz).
   * @default 5.0
   */
  vibrato_freq_hz?: number;

  /**
   * Vibrato pitch depth factor (0.0 to 1.0).
   * @default 0.3
   */
  vibrato_depth?: number;
};

/**
 * Perceptual loudness normalization parameters conforming to EBU R128 / ITU-R BS.1770-4.
 */
export type LoudnessSettings = {
  /**
   * Enables smooth perceptual loudness normalization across varying audio sources.
   * @default false
   */
  enabled?: boolean;

  /**
   * Target integrated loudness in LUFS (-24.0 to -8.0 LUFS).
   * Standard broadcast: -14.0 LUFS.
   * @default -14.0
   */
  target_lufs?: number;

  /**
   * Maximum amplification boost in dB (+3.0 to +15.0 dB).
   * @default 9.0
   */
  max_gain_db?: number;

  /**
   * Maximum attenuation cut in dB (-24.0 to -3.0 dB).
   * @default -12.0
   */
  min_gain_db?: number;
};

/**
 * Real-time independent tempo-stretching, pitch-shifting and resampling rate settings.
 */
export type TimescaleSettings = {
  /**
   * Playback speed multiplier (pitch-neutral time stretch, 0.25 to 4.0).
   * @default 1.0
   */
  speed?: number;

  /**
   * Pitch multiplier (tempo-neutral pitch shift, 0.25 to 4.0).
   * @default 1.0
   */
  pitch?: number;

  /**
   * Combined rate multiplier (analog speed + pitch resampling, 0.25 to 4.0).
   * @default 1.0
   */
  rate?: number;
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
  | 'nightcore'
  | 'vaporwave'
  | '8d'
  | 'tremolo'
  | 'vibrato'
  | 'broadcast'
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
  rotation: boolean;
  rotation_speed_hz: number;
  tremolo: boolean;
  vibrato: boolean;
  loudness: boolean;
  target_lufs: number;
  speed: number;
  pitch: number;
  rate: number;
};

export type DspPayload = {
  guild_id: string;
  preset?: string | null;
  spatial?: SpatialSettings | null;
  modulation?: ModulationSettings | null;
  loudness?: LoudnessSettings | null;
  timescale?: TimescaleSettings | null;
  bands?: BandSetting[] | null;
};

export type DspResponse = {
  guild_id: string;
  status: DspStatus;
  message: string;
};

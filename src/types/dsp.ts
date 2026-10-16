/**
 * Frecuencias centrales ISO estándar para el ecualizador de 15 bandas.
 */
export const EQ_FREQUENCIES = [
  25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000
] as const;

export type EqFrequency = (typeof EQ_FREQUENCIES)[number];

/**
 * Configuración de ganancia para una banda individual (0 a 14).
 * Acepta dB directo (-15.0 a +15.0) o escala lineal de Lavalink (-0.5 a +1.0).
 */
export type BandSetting = {
  band: number;
  gain: number;
};

/**
 * Parámetros de modelado acústico 3D y psicoacústico en tiempo real.
 */
export type SpatialSettings = {
  /**
   * Amplitud del campo estéreo Mid/Side:
   * 0.0 (Mono), 1.0 (Normal / Neutro), 1.35 (Inmersión 3D estándar), 2.0 (Ultra Wide).
   * @default 1.0
   */
  stereo_width?: number;

  /**
   * Activa el crossfeed acústico natural (difracción de sombra craneal a 700Hz sin comb-filter).
   * Reduce drásticamente la fatiga auditiva en auriculares.
   * @default false
   */
  binaural_crossfeed?: boolean;

  /**
   * Nivel de mezcla de crossfeed (0.0 a 0.40).
   * @default 0.18
   */
  crossfeed_level?: number;

  /**
   * Activa el excitador armónico de subgraves (< 85Hz).
   * Genera armónicos musicales cálidos para altavoces pequeños y auriculares.
   * @default false
   */
  bass_exciter?: boolean;

  /**
   * Intensidad de saturación armónica (0.0 a 1.0).
   * @default 0.35
   */
  bass_exciter_drive?: number;
};

/**
 * Presets de estudio calibrados de axAudio.
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
 * Telemetría del estado actual del DSP.
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

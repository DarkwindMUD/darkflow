/** Payload-free ping, including the server's empty-string echo. */
export type CorePing = undefined | "";

/** Server-side driver health reported by Darkwind.Lag.Status. */
export interface DarkwindLagStatus {
  uptime_s: number;
  window_s: number;
  hb_interval_ms: number;
  hb_drift_avg_ms: number;
  hb_drift_max_ms: number;
  hb_missed: number;
  cmds_per_sec_x100: number;
  lines_per_sec_x100: number;
  hb_processed_pct: number;
  obj_processed_pct: number;
}

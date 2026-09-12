import type { CharVitals } from "../gmcp/contracts/char.ts";

/** Panel id of the floating Wrathful Avatar bar. */
export const AVATAR_BAR_PANEL_ID = "avatarBar";

export type AvatarBarMode = "none" | "charging" | "active";
export type AvatarPatron = "mitra" | "gaea" | "set" | "";

export interface AvatarBarReading {
  readonly mode: AvatarBarMode;
  /** True when the vitals carry avatar fields at all. */
  readonly known: boolean;
  readonly label: string;
  /** Fill 0..100: predicted charge over its maximum, or active time left over its window. */
  readonly percent: number;
  readonly text: string;
  /** CSS background for the fill: a two-stop gradient in the patron's colours. */
  readonly background: string;
  readonly patron: AvatarPatron;
  /** True while charged to the maximum and waiting to be used. */
  readonly full: boolean;
  /** Seconds left in the active window, 0 otherwise. */
  readonly activeSeconds: number;
  /** True while a second-by-second refresh changes what the bar shows. */
  readonly ticking: boolean;
}

// The same colours the terminal meter used, per patron, resting and lit.
const FILLS: Record<
  "default" | Exclude<AvatarPatron, "">,
  { rest: [string, string]; lit: [string, string] }
> = {
  default: { rest: ["#7a1822", "#f85149"], lit: ["#b62335", "#ff7b72"] },
  mitra: { rest: ["#8f6b18", "#f2cc60"], lit: ["#f2cc60", "#fff2a8"] },
  gaea: { rest: ["#1f7a3b", "#7ee787"], lit: ["#56d364", "#aff5b4"] },
  set: { rest: ["#5f2c82", "#d2a8ff"], lit: ["#b083e6", "#f0dcff"] },
};

const gradient = ([from, to]: [string, string]): string => `linear-gradient(90deg, ${from}, ${to})`;

export function avatarPatron(vitals: CharVitals | null | undefined): AvatarPatron {
  const patron = String(vitals?.divine_patron ?? "").toLowerCase();
  return patron === "mitra" || patron === "gaea" || patron === "set" ? patron : "";
}

function fillFor(patron: AvatarPatron, lit: boolean): string {
  const set = FILLS[patron || "default"];
  return gradient(lit ? set.lit : set.rest);
}

/** "m:ss" for the active countdown. */
export function formatActive(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Reads the Wrathful Avatar state from Char.Vitals at `now`, mirroring the
 * terminal meter: an active window counts down from the `receivedAt` stamp,
 * and a charging avatar gains at `avatar_charge_rate_pct` per two seconds
 * from the charge the server last reported.
 */
export function avatarBarReading(
  vitals: CharVitals | null | undefined,
  now: number,
): AvatarBarReading {
  const patron = avatarPatron(vitals);
  const none: AvatarBarReading = {
    mode: "none",
    known: false,
    label: "Wrathful Avatar",
    percent: 0,
    text: "--",
    background: fillFor(patron, false),
    patron,
    full: false,
    activeSeconds: 0,
    ticking: false,
  };
  if (!vitals) return none;
  const receivedAt = Number((vitals as { receivedAt?: unknown }).receivedAt);
  const elapsedMs = Math.max(
    0,
    now - (Number.isFinite(receivedAt) && receivedAt > 0 ? receivedAt : now),
  );
  const activeAtSync = Number(
    (vitals as { avatar_active_remaining?: unknown }).avatar_active_remaining ??
      vitals.avatar_active,
  );
  const active = Number.isFinite(activeAtSync)
    ? Math.max(0, Math.ceil(activeAtSync - elapsedMs / 1000))
    : 0;
  if (active > 0) {
    const activeMax = Math.max(
      1,
      Number((vitals as { avatar_active_max?: unknown }).avatar_active_max) || activeAtSync,
    );
    const percent = Math.max(0, Math.min(100, (active / activeMax) * 100));
    return {
      mode: "active",
      known: true,
      label: "Wrathful Avatar",
      percent,
      text: `ACTIVE ${formatActive(active)}`,
      background: fillFor(patron, true),
      patron,
      full: false,
      activeSeconds: active,
      ticking: true,
    };
  }
  const charge = Number(vitals.avatar_charge);
  const max = Number((vitals as { avatar_charge_max?: unknown }).avatar_charge_max);
  if (!Number.isFinite(charge) || !(max > 0)) return none;
  const ratePct = Number((vitals as { avatar_charge_rate_pct?: unknown }).avatar_charge_rate_pct);
  const gained = (elapsedMs / 2000) * ((Number.isFinite(ratePct) ? ratePct : 100) / 100);
  const predicted = Math.max(0, Math.min(max, charge + gained));
  const percent = Math.max(0, Math.min(100, (predicted / max) * 100));
  const displayPct = Math.floor(percent);
  const full = displayPct >= 100;
  return {
    mode: "charging",
    known: true,
    label: "Wrathful Avatar",
    percent,
    text: full ? "READY" : `${displayPct}%`,
    background: fillFor(patron, full),
    patron,
    full,
    activeSeconds: 0,
    ticking: !full,
  };
}

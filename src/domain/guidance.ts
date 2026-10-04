/**
 * Load guidance engine. Pure functions only: no React, no Firestore.
 *
 * Input is a gap-filled daily series (see series.ts) ending on the evaluation
 * date. Output is a status (GREEN / AMBER / RED), every rule's outcome in plain
 * language, and a concrete load target for the next 7 days.
 */
import { ACUTE_DAYS, CHRONIC_DAYS, linearSlope, windowLoad } from './aggregate';
import { diffDays, formatShort } from './dates';
import { painZone } from './settings';
import type { DailyPoint } from './series';
import type { ISODate, Settings, Status } from './types';

export type RuleId =
  | 'pain-over-threshold'
  | 'next-morning-jump'
  | 'amber-3-days'
  | 'swelling-moderate'
  | 'acwr-high'
  | 'pain-amber-today'
  | 'wow-increase'
  | 'pain-trend-rising'
  | 'green-streak'
  | 'acwr-in-range';

/**
 * - `fired`: the rule's condition is met (for GREEN requirements: the requirement is NOT met)
 * - `ok`: evaluated, condition not met (requirement met)
 * - `insufficient`: not enough data to evaluate
 */
export type RuleState = 'fired' | 'ok' | 'insufficient';

export interface RuleCheck {
  id: RuleId;
  /** Status this rule pushes towards when it fires. */
  level: 'RED' | 'AMBER';
  state: RuleState;
  message: string;
}

export interface LoadTarget {
  /** Load over the last 7 days used as the base. */
  base: number;
  min: number;
  max: number;
  /** Human-readable target, e.g. "840–960" or "1100". */
  label: string;
  explanation: string;
}

export interface Guidance {
  date: ISODate;
  status: Status;
  headline: string;
  /** Rules that decided the status (fired RED rules, else fired AMBER rules, else green confirmations). */
  reasons: string[];
  /** "Not enough data yet" notes. */
  dataNotes: string[];
  checks: RuleCheck[];
  target: LoadTarget;
  metrics: {
    referenceDate: ISODate | null;
    acwr: number | null;
    last7Load: number;
    prev7Load: number | null;
    wowPct: number | null;
    painSlope: number | null;
    greenLoggedDays: number;
  };
}

export const HEADLINES: Record<Status, string> = {
  GREEN: 'OK to progress',
  AMBER: 'Hold current load',
  RED: 'Reduce load',
};

const EPS = 1e-9;
const fmt1 = (n: number) => (Math.round(n * 100) / 100).toString();
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n * 10) / 10}%`;

/**
 * The "reference day" for today's rules: today if anything was logged for it
 * (a daily score, an entry, or yesterday's next-morning pain), otherwise
 * yesterday if it was logged, otherwise none. This keeps the card meaningful
 * first thing in the morning before today's score is in.
 */
function referenceIndex(series: DailyPoint[]): number | null {
  const i = series.length - 1;
  const hasData = (k: number) =>
    k >= 0 && (series[k].logged || (k > 0 && series[k - 1].nextMorningPain !== null));
  if (hasData(i)) return i;
  if (hasData(i - 1)) return i - 1;
  return null;
}

export function evaluateGuidance(series: DailyPoint[], settings: Settings): Guidance {
  const s = settings;
  const last = series.length - 1;
  const date = series.length ? series[last].date : '';
  const checks: RuleCheck[] = [];
  const add = (id: RuleId, level: 'RED' | 'AMBER', state: RuleState, message: string) =>
    checks.push({ id, level, state, message });

  const ref = series.length ? referenceIndex(series) : null;
  const refPoint = ref !== null ? series[ref] : null;
  const prevOfRef = ref !== null && ref > 0 ? series[ref - 1] : null;
  const refLabel = refPoint ? (ref === last ? 'today' : `yesterday (${formatShort(refPoint.date)})`) : '';

  // ---------- RED rules ----------
  // R1: daily or session pain above the threshold.
  if (!refPoint) {
    add('pain-over-threshold', 'RED', 'insufficient', 'No pain logged today or yesterday.');
  } else {
    const obs: { label: string; v: number }[] = [];
    if (refPoint.dailyPain !== null) obs.push({ label: 'Daily pain', v: refPoint.dailyPain });
    for (const e of refPoint.entries) {
      if (e.painDuring != null) obs.push({ label: `Pain during ${e.activityName}`, v: e.painDuring });
    }
    if (prevOfRef) {
      for (const e of prevOfRef.entries) {
        if (e.painNextMorning != null)
          obs.push({ label: `Next-morning pain after ${e.activityName}`, v: e.painNextMorning });
      }
    }
    const over = obs.filter((o) => o.v > s.painThreshold);
    if (obs.length === 0) {
      add('pain-over-threshold', 'RED', 'insufficient', `No pain score logged ${refLabel}.`);
    } else if (over.length) {
      const worst = over.reduce((a, b) => (b.v > a.v ? b : a));
      add(
        'pain-over-threshold',
        'RED',
        'fired',
        `${worst.label} ${refLabel} was ${worst.v}/10 — above your pain threshold of ${s.painThreshold}.`,
      );
    } else {
      add('pain-over-threshold', 'RED', 'ok', `Pain ${refLabel} is at or below your threshold of ${s.painThreshold}.`);
    }
  }

  // R2: next-morning pain ≥ 2 points above the previous day's daily pain.
  {
    const day = prevOfRef;
    if (!day || day.nextMorningPain === null) {
      add('next-morning-jump', 'RED', 'insufficient', 'No next-morning pain recorded for the latest session yet.');
    } else if (!day.painLogged) {
      add('next-morning-jump', 'RED', 'insufficient', `No daily pain logged on ${formatShort(day.date)} to compare next-morning pain with.`);
    } else {
      const jump = day.nextMorningPain - day.pain;
      if (jump >= 2) {
        add(
          'next-morning-jump',
          'RED',
          'fired',
          `Next-morning pain (${day.nextMorningPain}) was ${jump} points higher than the day before (${day.pain}) — your knee reacted to ${formatShort(day.date)}'s load.`,
        );
      } else {
        add('next-morning-jump', 'RED', 'ok', `Next-morning pain didn't jump 2+ points after ${formatShort(day.date)}.`);
      }
    }
  }

  // Pain-logged days (zero-filled days are excluded).
  const painDays = series.filter((p) => p.painLogged);

  // R3: amber-or-worse pain for 3 consecutive logged days.
  {
    const last3 = painDays.slice(-3);
    if (last3.length < 3) {
      add('amber-3-days', 'RED', 'insufficient', `Need 3 logged pain days to check for a run of amber pain (have ${last3.length}).`);
    } else if (last3.every((p) => painZone(p.pain, s) !== 'green')) {
      add(
        'amber-3-days',
        'RED',
        'fired',
        `Pain has been amber or worse for 3 logged days in a row (${last3.map((p) => p.pain).join(', ')}).`,
      );
    } else {
      add('amber-3-days', 'RED', 'ok', 'No run of 3 logged days with amber-or-worse pain.');
    }
  }

  // R4: moderate swelling.
  if (refPoint?.swelling === 'moderate') {
    add('swelling-moderate', 'RED', 'fired', `Moderate swelling reported ${refLabel}.`);
  } else {
    add('swelling-moderate', 'RED', 'ok', 'No moderate swelling reported.');
  }

  // ACWR (shared by R5 and the GREEN requirement).
  let acwr: number | null = null;
  let acwrNote: string | null = null;
  if (series.length < CHRONIC_DAYS) {
    acwrNote = `Acute:chronic ratio needs ${CHRONIC_DAYS} days of history (have ${series.length}) — not enough data yet.`;
  } else {
    const acute = (windowLoad(series, last, ACUTE_DAYS) ?? 0) / ACUTE_DAYS;
    const chronic = (windowLoad(series, last, CHRONIC_DAYS) ?? 0) / CHRONIC_DAYS;
    if (chronic > 0) acwr = acute / chronic;
    else acwrNote = 'No load in the last 28 days, so the acute:chronic ratio can’t be computed yet.';
  }
  if (acwr === null) {
    add('acwr-high', 'RED', 'insufficient', acwrNote!);
  } else if (acwr > s.acwrUpper + EPS) {
    add('acwr-high', 'RED', 'fired', `Acute:chronic workload ratio is ${fmt1(acwr)} — above your upper limit of ${s.acwrUpper}. Load has spiked compared with the last 4 weeks.`);
  } else {
    add('acwr-high', 'RED', 'ok', `Acute:chronic workload ratio ${fmt1(acwr)} is at or below ${s.acwrUpper}.`);
  }

  // ---------- AMBER rules ----------
  // A1: pain in the amber zone (or worse) today.
  if (!refPoint || !refPoint.painLogged) {
    add('pain-amber-today', 'AMBER', 'insufficient', 'No pain score logged today or yesterday.');
  } else {
    const zone = painZone(refPoint.pain, s);
    if (zone !== 'green') {
      add('pain-amber-today', 'AMBER', 'fired', `Pain ${refLabel} (${refPoint.pain}) is in the ${zone} zone (green is 0–${s.greenMax}).`);
    } else {
      add('pain-amber-today', 'AMBER', 'ok', `Pain ${refLabel} (${refPoint.pain}) is in the green zone.`);
    }
  }

  // A2: rolling week-over-week load increase above the max.
  const last7Load = windowLoad(series, last, Math.min(7, series.length)) ?? 0;
  const prev7Load = windowLoad(series, last - 7, 7);
  let wowPct: number | null = null;
  if (prev7Load === null) {
    add('wow-increase', 'AMBER', 'insufficient', `Week-over-week change needs 14 days of history (have ${series.length}).`);
  } else if (prev7Load === 0) {
    if (last7Load > 0) add('wow-increase', 'AMBER', 'insufficient', 'The previous 7 days had no load, so a % change can’t be computed.');
    else add('wow-increase', 'AMBER', 'ok', 'No load in the last two weeks.');
  } else {
    wowPct = ((last7Load - prev7Load) / prev7Load) * 100;
    if (wowPct > s.maxWeeklyIncreasePct + EPS) {
      add('wow-increase', 'AMBER', 'fired', `Load over the last 7 days (${Math.round(last7Load)}) is ${fmtPct(wowPct)} vs the 7 days before (${Math.round(prev7Load)}) — more than your max of +${s.maxWeeklyIncreasePct}%.`);
    } else {
      add('wow-increase', 'AMBER', 'ok', `Week-over-week load change is ${fmtPct(wowPct)} (max +${s.maxWeeklyIncreasePct}%).`);
    }
  }

  // A3: rising pain trend over the last 7 logged days.
  const last7Pain = painDays.slice(-7);
  let painSlope: number | null = null;
  if (last7Pain.length < 7) {
    add('pain-trend-rising', 'AMBER', 'insufficient', `Pain trend needs 7 logged pain days (have ${last7Pain.length}).`);
  } else {
    const x0 = last7Pain[0].date;
    painSlope = linearSlope(last7Pain.map((p) => ({ x: diffDays(x0, p.date), y: p.pain })));
    if (painSlope !== null && painSlope > EPS) {
      add('pain-trend-rising', 'AMBER', 'fired', `Pain is trending up over your last 7 logged days (about +${fmt1(painSlope)} per day).`);
    } else {
      add('pain-trend-rising', 'AMBER', 'ok', 'Pain over your last 7 logged days is flat or falling.');
    }
  }

  // ---------- GREEN requirements (fire = requirement not met → hold) ----------
  const N = s.greenDaysRequired;
  const lastN = painDays.slice(-N);
  const greenLoggedDays = (() => {
    let n = 0;
    for (let i = painDays.length - 1; i >= 0 && painZone(painDays[i].pain, s) === 'green'; i--) n++;
    return n;
  })();
  if (lastN.length < N) {
    add('green-streak', 'AMBER', 'insufficient', `Need ${N} logged days in the green zone before progressing — you have ${lastN.length} logged day${lastN.length === 1 ? '' : 's'} so far. Days you didn't log don't count.`);
  } else if (lastN.every((p) => painZone(p.pain, s) === 'green')) {
    add('green-streak', 'AMBER', 'ok', `Your last ${N} logged days were all in the green zone.`);
  } else {
    add('green-streak', 'AMBER', 'fired', `Only ${greenLoggedDays} of the last ${N} logged days in a row were green — you need ${N}.`);
  }

  if (acwr === null) {
    add('acwr-in-range', 'AMBER', 'insufficient', acwrNote!);
  } else if (acwr < s.acwrLower - EPS) {
    add('acwr-in-range', 'AMBER', 'fired', `Acute:chronic ratio ${fmt1(acwr)} is below your lower limit of ${s.acwrLower} — rebuild gradually before progressing.`);
  } else if (acwr <= s.acwrUpper + EPS) {
    add('acwr-in-range', 'AMBER', 'ok', `Acute:chronic ratio ${fmt1(acwr)} is within ${s.acwrLower}–${s.acwrUpper}.`);
  } else {
    add('acwr-in-range', 'AMBER', 'fired', `Acute:chronic ratio ${fmt1(acwr)} is above ${s.acwrUpper}.`);
  }

  // ---------- Decide ----------
  const fired = (level: 'RED' | 'AMBER', ids?: RuleId[]) =>
    checks.filter((c) => c.level === level && c.state === 'fired' && (!ids || ids.includes(c.id)));
  const redFired = fired('RED');
  const amberRules: RuleId[] = ['pain-amber-today', 'wow-increase', 'pain-trend-rising'];
  const amberFired = fired('AMBER', amberRules);
  const greenReq = checks.filter((c) => c.id === 'green-streak' || c.id === 'acwr-in-range');
  const streakCheck = greenReq.find((c) => c.id === 'green-streak')!;
  const acwrCheck = greenReq.find((c) => c.id === 'acwr-in-range')!;

  let status: Status;
  let reasons: string[];
  if (redFired.length) {
    status = 'RED';
    reasons = redFired.map((c) => c.message);
  } else if (amberFired.length) {
    status = 'AMBER';
    reasons = amberFired.map((c) => c.message);
  } else if (streakCheck.state === 'ok' && acwrCheck.state !== 'fired') {
    status = 'GREEN';
    reasons = [streakCheck.message, acwrCheck.state === 'ok' ? acwrCheck.message : `${acwrCheck.message} Progress cautiously.`];
  } else {
    status = 'AMBER';
    reasons = [streakCheck, acwrCheck].filter((c) => c.state !== 'ok' && !(c.id === 'acwr-in-range' && c.state === 'insufficient')).map((c) => c.message);
  }

  const dataNotes = checks
    .filter((c) => c.state === 'insufficient')
    .map((c) => c.message)
    .filter((m, i, arr) => arr.indexOf(m) === i);

  return {
    date,
    status,
    headline: HEADLINES[status],
    reasons,
    dataNotes,
    checks,
    target: suggestTarget(status, series, s),
    metrics: {
      referenceDate: refPoint?.date ?? null,
      acwr,
      last7Load,
      prev7Load,
      wowPct,
      painSlope,
      greenLoggedDays,
    },
  };
}

/**
 * Concrete load target for the next 7 days, based on the load of the last 7
 * days (if that was 0, the 28-day weekly average is used instead).
 */
export function suggestTarget(status: Status, series: DailyPoint[], s: Settings): LoadTarget {
  const last = series.length - 1;
  let base = series.length ? windowLoad(series, last, Math.min(7, series.length)) ?? 0 : 0;
  let baseLabel = 'last 7 days';
  if (base === 0 && series.length >= CHRONIC_DAYS) {
    const chronicWeek = ((windowLoad(series, last, CHRONIC_DAYS) ?? 0) / CHRONIC_DAYS) * 7;
    if (chronicWeek > 0) {
      base = chronicWeek;
      baseLabel = 'your 4-week weekly average';
    }
  }
  const r = (n: number) => Math.round(n);
  const b = r(base);
  if (status === 'RED') {
    const min = r(base * (1 - s.reductionMaxPct / 100));
    const max = r(base * (1 - s.reductionMinPct / 100));
    return {
      base: b,
      min,
      max,
      label: min === max ? `${min}` : `${min}–${max}`,
      explanation: `${s.reductionMinPct}–${s.reductionMaxPct}% less than ${baseLabel} (${b}).`,
    };
  }
  if (status === 'GREEN') {
    const t = r(base * (1 + s.progressionPct / 100));
    return { base: b, min: t, max: t, label: `${t}`, explanation: `+${s.progressionPct}% on ${baseLabel} (${b}).` };
  }
  return { base: b, min: b, max: b, label: `${b}`, explanation: `Same as ${baseLabel}.` };
}

export interface StatusChange {
  date: ISODate;
  status: Status;
  from: Status | null;
  reasons: string[];
}

/** Evaluate guidance for every day of the series and return the days the status changed. */
export function statusTimeline(series: DailyPoint[], settings: Settings): StatusChange[] {
  const out: StatusChange[] = [];
  let prev: Status | null = null;
  for (let i = 0; i < series.length; i++) {
    const g = evaluateGuidance(series.slice(0, i + 1), settings);
    if (g.status !== prev) {
      out.push({ date: g.date, status: g.status, from: prev, reasons: g.reasons });
      prev = g.status;
    }
  }
  return out;
}

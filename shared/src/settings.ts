import type { MapDef, Settings } from './types.ts';

export const CLASSIC: Settings = {
  startingCash: 1500,
  salary: 200,
  incomeTax: { mode: 'percent', percent: 10 },
  auctions: true,
  doubleRentFullSet: true,
  rentInJail: true,
  fullSetToBuild: true,
  evenBuilding: true,
  sellBackPercent: 50,
  buildOnlyOwnTurn: false,
  mortgagePercent: 50,
  unmortgageInterestPercent: 10,
  interestOnTradedMortgage: true,
  rollAgainOnDoubles: true,
  threeDoublesJail: true,
  jailFine: 50,
  maxJailTurns: 3,
  trading: true,
  tradeOnlyOwnTurn: false,
  jailCardsTradable: true,
  bankruptProperties: 'unowned',
  win: { mode: 'lastStanding' },
  doubleSalaryOnStart: false,
  jackpot: { enabled: false, taxes: true, cardFines: true, jailFines: true, seed: 0 },
  lapBeforeBuying: false,
  dealtProperties: 0,
  room: {
    maxPlayers: 6,
    stepTimerSec: 60,
    auctionTimerSec: 10,
    awayTimeoutMin: 5,
    spectators: true,
    spectatorChat: true
  }
};

export const QUICK: Settings = {
  ...CLASSIC,
  dealtProperties: 2,
  win: { mode: 'rounds', rounds: 20 },
  room: { ...CLASSIC.room, stepTimerSec: 45 }
};

export const PRESETS: Record<string, Settings> = {
  classic: CLASSIC,
  quick: QUICK
};

export const STEP_TIMER_OPTIONS: (number | null)[] = [null, 30, 45, 60, 90];
export const AWAY_TIMEOUT_OPTIONS = [3, 5, 10];
export const MORTGAGE_OPTIONS = [50, 60, 75];
export const SELL_BACK_OPTIONS = [50, 100];

export interface NormalizedSettings {
  settings: Settings;
  notes: string[];
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

function pick<T>(value: T, options: T[], fallback: T): T {
  return options.includes(value) ? value : fallback;
}

export function purchasableCount(map: MapDef): number {
  return map.spaces.filter((s) => s.kind === 'street' || s.kind === 'transit' || s.kind === 'utility').length;
}

export function normalizeSettings(input: Settings, map: MapDef, playerCount?: number): NormalizedSettings {
  const s: Settings = structuredClone(input);
  const notes: string[] = [];

  s.startingCash = clampInt(s.startingCash, 500, 5000, CLASSIC.startingCash);
  s.salary = clampInt(s.salary, 0, 500, CLASSIC.salary);
  s.incomeTax =
    s.incomeTax.mode === 'percent'
      ? { mode: 'percent', percent: clampInt(s.incomeTax.percent, 0, 25, 10) }
      : { mode: 'flat', amount: clampInt(s.incomeTax.amount, 0, 500, 200) };
  s.sellBackPercent = pick(s.sellBackPercent, SELL_BACK_OPTIONS, 50);
  s.mortgagePercent = pick(s.mortgagePercent, MORTGAGE_OPTIONS, 50);
  s.unmortgageInterestPercent = clampInt(s.unmortgageInterestPercent, 0, 20, 10);
  s.jailFine = clampInt(s.jailFine, 0, 200, 50);
  s.maxJailTurns = clampInt(s.maxJailTurns, 1, 5, 3);
  s.jackpot.seed = clampInt(s.jackpot.seed, 0, 1000, 0);
  s.room.maxPlayers = clampInt(s.room.maxPlayers, 2, map.maxPlayers, Math.min(6, map.maxPlayers));
  s.room.stepTimerSec = pick(s.room.stepTimerSec, STEP_TIMER_OPTIONS, 60);
  s.room.auctionTimerSec = clampInt(s.room.auctionTimerSec, 5, 30, 10);
  s.room.awayTimeoutMin = pick(s.room.awayTimeoutMin, AWAY_TIMEOUT_OPTIONS, 5);

  if (!s.rollAgainOnDoubles && s.threeDoublesJail) {
    s.threeDoublesJail = false;
    notes.push('Three doubles to the Visa Office is off because roll again on doubles is off.');
  }

  if (!s.auctions && s.bankruptProperties === 'auction') {
    s.bankruptProperties = 'unowned';
    notes.push('Bankrupt players properties become unowned because auctions are off.');
  }

  const players = playerCount ?? s.room.maxPlayers;
  const dealtCap = Math.min(5, Math.floor(purchasableCount(map) / 2 / players));
  const dealt = clampInt(s.dealtProperties, 0, 5, 0);
  s.dealtProperties = Math.min(dealt, dealtCap);
  if (dealt > dealtCap) notes.push(`Properties dealt at the start is capped at ${dealtCap} each for ${players} players.`);

  if (s.win.mode === 'rounds') {
    s.win = { mode: 'rounds', rounds: clampInt(s.win.rounds, 5, 500, 30) };
  }

  if (s.win.mode === 'netWorth') {
    const minimum = s.startingCash * 2;
    const target = Math.round(Number.isFinite(s.win.target) ? s.win.target : 10000);
    if (target < minimum) notes.push(`The net worth target is raised to $${minimum}, twice the starting cash.`);
    s.win = { mode: 'netWorth', target: Math.max(minimum, target) };
  }

  if (s.jackpot.enabled && !s.jackpot.taxes && !s.jackpot.cardFines && !s.jackpot.jailFines) {
    notes.push('No money sources are ticked, so only the seed money goes into the jackpot.');
  }

  if (!s.trading && s.tradeOnlyOwnTurn) {
    s.tradeOnlyOwnTurn = false;
  }

  if (!s.room.spectators && s.room.spectatorChat) {
    s.room.spectatorChat = false;
  }

  return { settings: s, notes };
}

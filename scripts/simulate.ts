import { CLASSIC, QUICK } from '../shared/src/settings.ts';
import type { Settings } from '../shared/src/types.ts';
import { simulateGame, type SimResult } from '../shared/sim/harness.ts';

function flag(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? Number(process.argv[at + 1]) : fallback;
}

function variant(name: string, change: (s: Settings) => void): { name: string; settings: Settings } {
  const settings = structuredClone(CLASSIC);
  change(settings);
  return { name, settings };
}

const VARIANTS = [
  { name: 'classic', settings: structuredClone(CLASSIC) },
  { name: 'quick', settings: structuredClone(QUICK) },
  variant('jackpot + double salary', (s) => {
    s.jackpot.enabled = true;
    s.jackpot.seed = 100;
    s.doubleSalaryOnStart = true;
  }),
  variant('no auctions, lap first', (s) => {
    s.auctions = false;
    s.lapBeforeBuying = true;
  }),
  variant('auction bankrupt property', (s) => {
    s.bankruptProperties = 'auction';
  }),
  variant('flat tax, trade on own turn', (s) => {
    s.incomeTax = { mode: 'flat', amount: 200 };
    s.tradeOnlyOwnTurn = true;
  }),
  variant('net worth target', (s) => {
    s.win = { mode: 'netWorth', target: 6000 };
  }),
  variant('loose building', (s) => {
    s.evenBuilding = false;
    s.fullSetToBuild = false;
    s.sellBackPercent = 100;
    s.buildOnlyOwnTurn = true;
  }),
  variant('no doubles, no step timer', (s) => {
    s.rollAgainOnDoubles = false;
    s.room.stepTimerSec = null;
    s.maxJailTurns = 1;
  })
];

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summarize(label: string, results: SimResult[]): void {
  const finished = results.filter((r) => r.finished);
  const turns = finished.map((r) => r.turns);
  const rounds = finished.map((r) => r.rounds);

  console.log(`\n${label}: ${results.length} games`);
  console.log(
    `  finished on their own ${finished.length} (${((finished.length / results.length) * 100).toFixed(1)}%), ` +
      `ended by the host after 30,000 actions ${results.filter((r) => r.endedByHost).length}, stalled ${results.filter((r) => r.stalled).length}`
  );
  console.log(`  rounds  median ${percentile(rounds, 50)}, p90 ${percentile(rounds, 90)}, max ${rounds.reduce((a, b) => Math.max(a, b), 0)}`);
  console.log(`  turns   median ${percentile(turns, 50)}, p90 ${percentile(turns, 90)}`);
  console.log(`  at 20 s a turn: median ${Math.round((percentile(turns, 50) * 20) / 60)} min, p90 ${Math.round((percentile(turns, 90) * 20) / 60)} min`);
  console.log(`  at 35 s a turn: median ${Math.round((percentile(turns, 50) * 35) / 60)} min, p90 ${Math.round((percentile(turns, 90) * 35) / 60)} min`);
}

const games = flag('games', 10000);
const timedGames = flag('timed', 300);
const started = performance.now();
const results: { variant: string; players: number; chaos: boolean; result: SimResult }[] = [];

for (let i = 0; i < games; i++) {
  const v = VARIANTS[i % VARIANTS.length];
  const players = 2 + (i % 5);
  const chaos = i % 10 < 3;
  const result = simulateGame({ seed: i + 1, players, settings: v.settings, chaos, checkInvariants: true });
  results.push({ variant: v.name, players, chaos, result });
}

const elapsed = (performance.now() - started) / 1000;
const all = results.map((r) => r.result);

console.log(`Simulated ${games} games in ${elapsed.toFixed(1)} s with invariant checks after every action.`);
console.log(`Total actions ${all.reduce((s, r) => s + r.actions, 0)}, rejected attempts ${all.reduce((s, r) => s + r.rejected, 0)}.`);
console.log(
  `Bankruptcies ${all.reduce((s, r) => s + r.bankrupt, 0)}, leaves ${all.reduce((s, r) => s + r.left, 0)}, away timeouts ${all.reduce((s, r) => s + r.timedOut, 0)}, ` +
    `step-timer defaults ${all.reduce((s, r) => s + r.stepDefaults, 0)}, restores ${all.reduce((s, r) => s + r.restores, 0)}, ` +
    `auctions ${all.reduce((s, r) => s + r.auctions, 0)}, accepted trades ${all.reduce((s, r) => s + r.trades, 0)}.`
);

summarize('Classic Harborview, all player counts, no chaos', results.filter((r) => r.variant === 'classic' && !r.chaos).map((r) => r.result));
for (let players = 2; players <= 6; players++) {
  summarize(`Classic, ${players} players, no chaos`, results.filter((r) => r.variant === 'classic' && !r.chaos && r.players === players).map((r) => r.result));
}
summarize('Quick preset', results.filter((r) => r.variant === 'quick').map((r) => r.result));
summarize('Every variant, chaos on', results.filter((r) => r.chaos).map((r) => r.result));

for (const v of VARIANTS) {
  const subset = results.filter((r) => r.variant === v.name).map((r) => r.result);
  const finished = subset.filter((r) => r.finished).length;
  console.log(`  ${v.name.padEnd(28)} finished ${finished}/${subset.length}`);
}

let times: number[] = [];
for (let i = 0; i < timedGames; i++) {
  const v = VARIANTS[i % VARIANTS.length];
  const result = simulateGame({ seed: 100000 + i, players: 6, settings: v.settings, safe: true, timeActions: true });
  times = times.concat(result.actionTimesMs);
}

if (times.length > 0) {
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const max = times.reduce((a, b) => Math.max(a, b), 0);
  console.log(`\nCPU per action with the clone-and-apply path the server will use (${times.length} actions, 6 players):`);
  console.log(`  mean ${mean.toFixed(3)} ms, p99 ${percentile(times, 99).toFixed(3)} ms, max ${max.toFixed(3)} ms`);
  console.log(`  actions over 10 ms: ${times.filter((t) => t > 10).length}`);
}

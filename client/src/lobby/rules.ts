import type { Settings } from '../../../shared/src/types.ts';

export interface Option {
  value: string;
  label: string;
}

interface BaseRow {
  id: string;
  label: string;
  desc: string;
  house?: boolean | ((s: Settings) => boolean);
  hidden?: (s: Settings) => boolean;
  blocked?: (s: Settings) => string | null;
}

export type RuleRow =
  | (BaseRow & { kind: 'toggle'; get: (s: Settings) => boolean; set: (s: Settings, v: boolean) => void })
  | (BaseRow & { kind: 'select'; options: Option[]; get: (s: Settings) => string; set: (s: Settings, v: string) => void })
  | (BaseRow & { kind: 'number'; min: number; max: number; step: number; prefix?: string; suffix?: string; get: (s: Settings) => number; set: (s: Settings, v: number) => void });

export interface RuleSection {
  id: string;
  title: string;
  rows: RuleRow[];
}

const timerOptions: Option[] = [
  { value: 'off', label: 'Off' },
  { value: '30', label: '30 s' },
  { value: '45', label: '45 s' },
  { value: '60', label: '60 s' },
  { value: '90', label: '90 s' }
];

export const SECTIONS: RuleSection[] = [
  {
    id: 'money',
    title: 'Money',
    rows: [
      { id: 'startingCash', kind: 'number', label: 'Starting cash', desc: 'Cash each player starts with', min: 500, max: 5000, step: 100, prefix: '$', get: (s) => s.startingCash, set: (s, v) => (s.startingCash = v) },
      { id: 'salary', kind: 'number', label: 'Salary', desc: 'Paid every time you pass Start', min: 0, max: 500, step: 50, prefix: '$', get: (s) => s.salary, set: (s, v) => (s.salary = v) },
      {
        id: 'incomeTax',
        kind: 'select',
        label: 'Income tax',
        desc: 'Charged on the Departure Tax space',
        options: [
          { value: 'p5', label: '5% of cash' },
          { value: 'p10', label: '10% of cash' },
          { value: 'p15', label: '15% of cash' },
          { value: 'p20', label: '20% of cash' },
          { value: 'f100', label: 'Flat $100' },
          { value: 'f200', label: 'Flat $200' }
        ],
        get: (s) => (s.incomeTax.mode === 'percent' ? `p${s.incomeTax.percent}` : `f${s.incomeTax.amount}`),
        set: (s, v) => (s.incomeTax = v.startsWith('p') ? { mode: 'percent', percent: Number(v.slice(1)) } : { mode: 'flat', amount: Number(v.slice(1)) })
      },
      { id: 'doubleSalary', kind: 'toggle', label: 'Double salary on Start', desc: 'Landing exactly on Start pays double', house: true, get: (s) => s.doubleSalaryOnStart, set: (s, v) => (s.doubleSalaryOnStart = v) }
    ]
  },
  {
    id: 'jackpot',
    title: 'Jackpot',
    rows: [
      { id: 'jackpot', kind: 'toggle', label: 'Jackpot on the Plaza', desc: 'Money paid to the bank piles up for whoever lands on the Plaza', house: true, get: (s) => s.jackpot.enabled, set: (s, v) => (s.jackpot.enabled = v) },
      { id: 'jpTaxes', kind: 'toggle', label: 'Taxes go in', desc: 'Departure Tax and Customs', hidden: (s) => !s.jackpot.enabled, get: (s) => s.jackpot.taxes, set: (s, v) => (s.jackpot.taxes = v) },
      { id: 'jpCards', kind: 'toggle', label: 'Card fines go in', desc: 'Money paid because of a card', hidden: (s) => !s.jackpot.enabled, get: (s) => s.jackpot.cardFines, set: (s, v) => (s.jackpot.cardFines = v) },
      { id: 'jpJail', kind: 'toggle', label: 'Visa Office fines go in', desc: 'Fines paid to leave the Visa Office', hidden: (s) => !s.jackpot.enabled, get: (s) => s.jackpot.jailFines, set: (s, v) => (s.jackpot.jailFines = v) },
      { id: 'jpSeed', kind: 'number', label: 'Seed money', desc: 'Put in by the bank each time the jackpot is won', min: 0, max: 1000, step: 50, prefix: '$', hidden: (s) => !s.jackpot.enabled, get: (s) => s.jackpot.seed, set: (s, v) => (s.jackpot.seed = v) }
    ]
  },
  {
    id: 'buying',
    title: 'Buying',
    rows: [
      { id: 'auctions', kind: 'toggle', label: 'Auction passed properties', desc: 'A property nobody buys goes up for auction', get: (s) => s.auctions, set: (s, v) => (s.auctions = v) },
      { id: 'lap', kind: 'toggle', label: 'Lap before buying', desc: 'No buying until your first lap is done', house: true, get: (s) => s.lapBeforeBuying, set: (s, v) => (s.lapBeforeBuying = v) },
      { id: 'dealt', kind: 'number', label: 'Properties dealt at start', desc: 'Random properties handed out before the first roll', min: 0, max: 5, step: 1, house: (s) => s.dealtProperties > 0, get: (s) => s.dealtProperties, set: (s, v) => (s.dealtProperties = v) }
    ]
  },
  {
    id: 'rent',
    title: 'Rent',
    rows: [
      { id: 'doubleRent', kind: 'toggle', label: 'Double rent on a full set', desc: 'While the set has no buildings', get: (s) => s.doubleRentFullSet, set: (s, v) => (s.doubleRentFullSet = v) },
      { id: 'jailRent', kind: 'toggle', label: 'Rent while at the Visa Office', desc: 'Players at the Visa Office still collect rent', get: (s) => s.rentInJail, set: (s, v) => (s.rentInJail = v) }
    ]
  },
  {
    id: 'building',
    title: 'Building',
    rows: [
      { id: 'fullSet', kind: 'toggle', label: 'Full set needed', desc: 'You need the whole colour set to build', get: (s) => s.fullSetToBuild, set: (s, v) => (s.fullSetToBuild = v) },
      { id: 'even', kind: 'toggle', label: 'Even building', desc: 'Build and sell evenly across a set', get: (s) => s.evenBuilding, set: (s, v) => (s.evenBuilding = v) },
      {
        id: 'sellBack',
        kind: 'select',
        label: 'Sell-back value',
        desc: 'What the bank pays back for a building',
        options: [
          { value: '50', label: '50%' },
          { value: '100', label: '100%' }
        ],
        house: (s) => s.sellBackPercent === 100,
        get: (s) => String(s.sellBackPercent),
        set: (s, v) => (s.sellBackPercent = Number(v))
      },
      {
        id: 'whenBuild',
        kind: 'select',
        label: 'When you can build',
        desc: 'Building outside your own turn',
        options: [
          { value: 'any', label: 'Any time' },
          { value: 'own', label: 'Own turn only' }
        ],
        get: (s) => (s.buildOnlyOwnTurn ? 'own' : 'any'),
        set: (s, v) => (s.buildOnlyOwnTurn = v === 'own')
      }
    ]
  },
  {
    id: 'mortgages',
    title: 'Mortgages',
    rows: [
      {
        id: 'mortgageValue',
        kind: 'select',
        label: 'Mortgage value',
        desc: 'Cash you get for mortgaging',
        options: [
          { value: '50', label: '50%' },
          { value: '60', label: '60%' },
          { value: '75', label: '75%' }
        ],
        get: (s) => String(s.mortgagePercent),
        set: (s, v) => (s.mortgagePercent = Number(v))
      },
      { id: 'interest', kind: 'number', label: 'Unmortgage interest', desc: 'Extra you pay to lift a mortgage', min: 0, max: 20, step: 1, suffix: '%', get: (s) => s.unmortgageInterestPercent, set: (s, v) => (s.unmortgageInterestPercent = v) },
      { id: 'tradeInterest', kind: 'toggle', label: 'Interest on traded mortgages', desc: 'Due when you receive a mortgaged property', get: (s) => s.interestOnTradedMortgage, set: (s, v) => (s.interestOnTradedMortgage = v) }
    ]
  },
  {
    id: 'dice',
    title: 'Dice and the Visa Office',
    rows: [
      { id: 'doubles', kind: 'toggle', label: 'Roll again on doubles', desc: 'Doubles give you another roll', get: (s) => s.rollAgainOnDoubles, set: (s, v) => (s.rollAgainOnDoubles = v) },
      {
        id: 'threeDoubles',
        kind: 'toggle',
        label: 'Three doubles to the Visa Office',
        desc: 'A third double in a row sends you to the Visa Office',
        blocked: (s) => (s.rollAgainOnDoubles ? null : 'Needs roll again on doubles'),
        get: (s) => s.threeDoublesJail,
        set: (s, v) => (s.threeDoublesJail = v)
      },
      { id: 'fine', kind: 'number', label: 'Visa Office fine', desc: 'Pay this to leave the Visa Office', min: 0, max: 200, step: 10, prefix: '$', get: (s) => s.jailFine, set: (s, v) => (s.jailFine = v) },
      { id: 'maxJail', kind: 'number', label: 'Longest stay', desc: 'Turns at the Visa Office before you must pay', min: 1, max: 5, step: 1, suffix: ' turns', get: (s) => s.maxJailTurns, set: (s, v) => (s.maxJailTurns = v) }
    ]
  },
  {
    id: 'trading',
    title: 'Trading',
    rows: [
      { id: 'trading', kind: 'toggle', label: 'Trading', desc: 'Trade properties, cash and cards with anyone', get: (s) => s.trading, set: (s, v) => (s.trading = v) },
      {
        id: 'ownTurn',
        kind: 'toggle',
        label: 'Trade only on your turn',
        desc: 'Offers can only be sent on your own turn',
        house: true,
        blocked: (s) => (s.trading ? null : 'Needs trading on'),
        get: (s) => s.tradeOnlyOwnTurn,
        set: (s, v) => (s.tradeOnlyOwnTurn = v)
      },
      {
        id: 'cardsTradable',
        kind: 'toggle',
        label: 'Visa Office passes tradable',
        desc: 'Visa Office passes can be traded',
        blocked: (s) => (s.trading ? null : 'Needs trading on'),
        get: (s) => s.jailCardsTradable,
        set: (s, v) => (s.jailCardsTradable = v)
      }
    ]
  },
  {
    id: 'ending',
    title: 'Bankruptcy and winning',
    rows: [
      {
        id: 'bankruptProps',
        kind: 'select',
        label: 'Properties of bankrupt players',
        desc: 'Also used when someone leaves or times out',
        options: [
          { value: 'unowned', label: 'Become unowned' },
          { value: 'auction', label: 'Go to auction' }
        ],
        blocked: (s) => (s.auctions ? null : 'Auctions are off, so they always become unowned'),
        get: (s) => s.bankruptProperties,
        set: (s, v) => (s.bankruptProperties = v as Settings['bankruptProperties'])
      },
      {
        id: 'win',
        kind: 'select',
        label: 'Win condition',
        desc: 'How the game ends',
        options: [
          { value: 'lastStanding', label: 'Last one standing' },
          { value: 'rounds', label: 'Richest after N rounds' },
          { value: 'netWorth', label: 'First to a net worth' }
        ],
        get: (s) => s.win.mode,
        set: (s, v) => (s.win = v === 'rounds' ? { mode: 'rounds', rounds: 30 } : v === 'netWorth' ? { mode: 'netWorth', target: 10000 } : { mode: 'lastStanding' })
      },
      {
        id: 'rounds',
        kind: 'number',
        label: 'Round limit',
        desc: 'The richest player wins after this many rounds',
        min: 5,
        max: 200,
        step: 5,
        hidden: (s) => s.win.mode !== 'rounds',
        get: (s) => (s.win.mode === 'rounds' ? s.win.rounds : 30),
        set: (s, v) => (s.win = { mode: 'rounds', rounds: v })
      },
      {
        id: 'target',
        kind: 'number',
        label: 'Net worth target',
        desc: 'At least twice the starting cash',
        min: 1000,
        max: 100000,
        step: 1000,
        prefix: '$',
        hidden: (s) => s.win.mode !== 'netWorth',
        get: (s) => (s.win.mode === 'netWorth' ? s.win.target : 10000),
        set: (s, v) => (s.win = { mode: 'netWorth', target: v })
      }
    ]
  },
  {
    id: 'room',
    title: 'Room',
    rows: [
      { id: 'maxPlayers', kind: 'number', label: 'Max players', desc: 'Seats in this room', min: 2, max: 8, step: 1, get: (s) => s.room.maxPlayers, set: (s, v) => (s.room.maxPlayers = v) },
      {
        id: 'stepTimer',
        kind: 'select',
        label: 'Step timer',
        desc: 'Time for each step before the game acts for you',
        options: timerOptions,
        get: (s) => (s.room.stepTimerSec === null ? 'off' : String(s.room.stepTimerSec)),
        set: (s, v) => (s.room.stepTimerSec = v === 'off' ? null : Number(v))
      },
      { id: 'auctionTimer', kind: 'number', label: 'Auction timer', desc: 'At least 5 s more after each bid', min: 5, max: 30, step: 5, suffix: ' s', get: (s) => s.room.auctionTimerSec, set: (s, v) => (s.room.auctionTimerSec = v) },
      {
        id: 'awayTimeout',
        kind: 'select',
        label: 'Away timeout',
        desc: 'Time to rejoin before a player is removed',
        options: [
          { value: '3', label: '3 min' },
          { value: '5', label: '5 min' },
          { value: '10', label: '10 min' }
        ],
        get: (s) => String(s.room.awayTimeoutMin),
        set: (s, v) => (s.room.awayTimeoutMin = Number(v))
      },
      { id: 'spectators', kind: 'toggle', label: 'Spectators', desc: 'People with the link can watch', get: (s) => s.room.spectators, set: (s, v) => (s.room.spectators = v) },
      {
        id: 'spectatorChat',
        kind: 'toggle',
        label: 'Spectator chat',
        desc: 'Watchers can post in chat',
        blocked: (s) => (s.room.spectators ? null : 'Needs spectators on'),
        get: (s) => s.room.spectatorChat,
        set: (s, v) => (s.room.spectatorChat = v)
      }
    ]
  }
];

export function isHouseRule(row: RuleRow, settings: Settings): boolean {
  if (typeof row.house === 'function') return row.house(settings);
  if (!row.house) return false;
  return row.kind === 'toggle' ? row.get(settings) : true;
}

export function houseRulesOn(section: RuleSection, settings: Settings): number {
  return section.rows.filter((r) => !r.hidden?.(settings) && isHouseRule(r, settings) && (r.kind !== 'toggle' || r.get(settings))).length;
}

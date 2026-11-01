export type PlayerId = string;

export type DeckId = 'dispatch' | 'wildcard';

export interface GroupDef {
  name: string;
  color: string;
  icon: string;
  houseCost: number;
}

export type TaxDef = { type: 'income' } | { type: 'flat'; amount: number };

export interface StreetSpace {
  kind: 'street';
  name: string;
  group: string;
  price: number;
  rents: number[];
}

export interface TransitSpace {
  kind: 'transit';
  name: string;
  price: number;
}

export interface UtilitySpace {
  kind: 'utility';
  name: string;
  price: number;
}

export type PropertySpace = StreetSpace | TransitSpace | UtilitySpace;

export type SpaceDef =
  | PropertySpace
  | { kind: 'start'; name: string }
  | { kind: 'jail'; name: string }
  | { kind: 'free'; name: string }
  | { kind: 'goToJail'; name: string }
  | { kind: 'card'; name: string; deck: DeckId }
  | { kind: 'tax'; name: string; tax: TaxDef };

export interface MapDef {
  id: string;
  name: string;
  maxPlayers: number;
  groups: Record<string, GroupDef>;
  spaces: SpaceDef[];
  transitRents: number[];
  utilityMultipliers: number[];
}

export type CardTarget =
  | 'start'
  | 'priciestStreet'
  | 'cheapestStreet'
  | 'nearestTransit'
  | 'nearestUtility'
  | 'randomStreet';

export type CardEffect =
  | { type: 'money'; amount: number }
  | { type: 'moveTo'; target: CardTarget; transitMultiplier?: number; utilityDice?: number }
  | { type: 'moveBy'; steps: number }
  | { type: 'goToJail' }
  | { type: 'jailCard' }
  | { type: 'payEach'; amount: number }
  | { type: 'collectEach'; amount: number }
  | { type: 'repairs'; perHouse: number; perHotel: number };

export interface CardDef {
  text: string;
  effect: CardEffect;
}

export interface DeckDef {
  name: string;
  cards: CardDef[];
}

export type WinCondition =
  | { mode: 'lastStanding' }
  | { mode: 'rounds'; rounds: number }
  | { mode: 'netWorth'; target: number };

export type IncomeTax = { mode: 'percent'; percent: number } | { mode: 'flat'; amount: number };

export interface JackpotSettings {
  enabled: boolean;
  taxes: boolean;
  cardFines: boolean;
  jailFines: boolean;
  seed: number;
}

export interface RoomSettings {
  maxPlayers: number;
  stepTimerSec: number | null;
  auctionTimerSec: number;
  awayTimeoutMin: number;
  spectators: boolean;
  spectatorChat: boolean;
}

export interface Settings {
  startingCash: number;
  salary: number;
  incomeTax: IncomeTax;
  auctions: boolean;
  doubleRentFullSet: boolean;
  rentInJail: boolean;
  fullSetToBuild: boolean;
  evenBuilding: boolean;
  sellBackPercent: number;
  buildOnlyOwnTurn: boolean;
  mortgagePercent: number;
  unmortgageInterestPercent: number;
  interestOnTradedMortgage: boolean;
  rollAgainOnDoubles: boolean;
  threeDoublesJail: boolean;
  jailFine: number;
  maxJailTurns: number;
  trading: boolean;
  tradeOnlyOwnTurn: boolean;
  jailCardsTradable: boolean;
  bankruptProperties: 'unowned' | 'auction';
  win: WinCondition;
  doubleSalaryOnStart: boolean;
  jackpot: JackpotSettings;
  lapBeforeBuying: boolean;
  dealtProperties: number;
  room: RoomSettings;
}

export type Creditor = { kind: 'player'; id: PlayerId } | { kind: 'bank' } | { kind: 'jackpot' };

export interface Debt {
  debtor: PlayerId;
  creditor: Creditor;
  amount: number;
  reason: string;
}

export interface AwayState {
  deadline: number;
  votes: PlayerId[];
  extensions: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  color: string;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: DeckId[];
  laps: number;
  status: 'active' | 'bankrupt' | 'left';
  connected: boolean;
  away: AwayState | null;
}

export interface PropertyState {
  owner: PlayerId | null;
  houses: number;
  mortgaged: boolean;
}

export type TurnPhase = 'preRoll' | 'buyDecision' | 'postRoll';

export interface TurnState {
  player: PlayerId;
  phase: TurnPhase;
  doubles: number;
  rolls: number;
  canRollAgain: boolean;
  lastRoll: [number, number] | null;
  pendingBuy: number | null;
  number: number;
}

export interface AuctionState {
  id: number;
  space: number;
  highBid: number;
  highBidder: PlayerId | null;
  bidders: PlayerId[];
  deadline: number;
  source: 'declined' | 'bankruptcy';
}

export interface Bundle {
  properties: number[];
  cash: number;
  jailCards: number;
}

export interface TradeOffer {
  id: number;
  from: PlayerId;
  to: PlayerId;
  give: Bundle;
  get: Bundle;
  createdAt: number;
}

export interface StepTimer {
  key: string;
  remaining: number;
  deadline: number | null;
}

export interface GameEvent {
  type: string;
  player?: PlayerId;
  target?: PlayerId;
  space?: number;
  amount?: number;
  detail?: string;
}

export interface GameState {
  schema: 1;
  version: number;
  mapId: string;
  settings: Settings;
  rng: number;
  status: 'playing' | 'finished';
  players: PlayerState[];
  turn: TurnState;
  round: number;
  props: (PropertyState | null)[];
  decks: Record<DeckId, number[]>;
  lastCard: { deck: DeckId; card: number; player: PlayerId } | null;
  jackpot: number;
  auction: AuctionState | null;
  auctionQueue: number[];
  nextAuctionId: number;
  debts: Debt[];
  trades: TradeOffer[];
  nextTradeId: number;
  timers: { step: StepTimer | null; pausedAt: number | null };
  initialMoney: number;
  bankNet: number;
  winners: PlayerId[];
  log: GameEvent[];
}

export type PlayerAction =
  | { type: 'roll'; player: PlayerId }
  | { type: 'payJailFine'; player: PlayerId }
  | { type: 'useJailCard'; player: PlayerId }
  | { type: 'buy'; player: PlayerId }
  | { type: 'decline'; player: PlayerId }
  | { type: 'endTurn'; player: PlayerId }
  | { type: 'bid'; player: PlayerId; auction: number; amount: number }
  | { type: 'dropOut'; player: PlayerId; auction: number }
  | { type: 'build'; player: PlayerId; space: number }
  | { type: 'sellBuilding'; player: PlayerId; space: number }
  | { type: 'mortgage'; player: PlayerId; space: number }
  | { type: 'unmortgage'; player: PlayerId; space: number }
  | { type: 'proposeTrade'; player: PlayerId; to: PlayerId; give: Bundle; get: Bundle }
  | { type: 'acceptTrade'; player: PlayerId; trade: number }
  | { type: 'declineTrade'; player: PlayerId; trade: number }
  | { type: 'cancelTrade'; player: PlayerId; trade: number }
  | { type: 'counterTrade'; player: PlayerId; trade: number; give: Bundle; get: Bundle }
  | { type: 'declareBankruptcy'; player: PlayerId }
  | { type: 'leave'; player: PlayerId }
  | { type: 'voteExtend'; player: PlayerId; target: PlayerId };

export type SystemAction =
  | { type: 'tick' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restore' }
  | { type: 'endGame' }
  | { type: 'extendDeadlines'; minMs: number }
  | { type: 'remove'; player: PlayerId }
  | { type: 'disconnect'; player: PlayerId }
  | { type: 'reconnect'; player: PlayerId };

export type Action = PlayerAction | SystemAction;

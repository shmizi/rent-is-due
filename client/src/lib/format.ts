import { DECKS } from '../../../shared/src/cards.ts';
import { getMap } from '../../../shared/src/maps/index.ts';
import type { DeckId, GameEvent } from '../../../shared/src/types.ts';
import type { GameView } from '../../../shared/src/view.ts';

export function money(n: number): string {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
}

export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function nameOf(game: GameView, id: string | undefined): string {
  if (!id) return 'Someone';
  return game.players.find((p) => p.id === id)?.name ?? 'Someone';
}

export function spaceName(game: GameView, index: number | undefined): string {
  if (index === undefined) return 'a space';
  return getMap(game.mapId).spaces[index]?.name ?? 'a space';
}

const REASONS: Record<string, string> = {
  rent: 'in rent',
  tax: 'in tax',
  card: 'for a card',
  repairs: 'for repairs',
  jailFine: 'to leave the Visa Office',
  auction: 'for the auction',
  mortgageInterest: 'in mortgage interest'
};

export function cardOf(detail: string | undefined) {
  if (!detail) return null;
  const [deck, index] = detail.split(':');
  return DECKS[deck as DeckId]?.cards[Number(index)] ?? null;
}

export function describe(event: GameEvent, game: GameView): string | null {
  const who = nameOf(game, event.player);
  const target = event.target ? nameOf(game, event.target) : 'the bank';
  const space = spaceName(game, event.space);
  const amount = money(event.amount ?? 0);

  switch (event.type) {
    case 'rolled':
      return `${who} rolled ${event.detail?.replace('+', ' + ')}`;
    case 'salary':
      return `${who} collected ${amount} for passing Start`;
    case 'paid':
      return event.target ? `${who} paid ${target} ${amount} ${REASONS[event.detail ?? ''] ?? ''}`.trim() : `${who} paid ${amount} ${REASONS[event.detail ?? ''] ?? ''}`.trim();
    case 'debt':
      return `${who} owes ${target} ${amount} and needs to raise the cash`;
    case 'debtPaid':
      return `${who} paid off ${amount} owed to ${target}`;
    case 'jailed':
      return `${who} went to the Visa Office`;
    case 'leftJail':
      return {
        doubles: `${who} rolled doubles and got out of the Visa Office`,
        paid: `${who} paid the fine and left the Visa Office`,
        card: `${who} used a get-out card`,
        forced: `${who} paid the fine after the last turn at the Visa Office`,
        timeUp: `${who} was let out of the Visa Office after the last attempt`
      }[event.detail ?? ''] ?? `${who} left the Visa Office`;
    case 'card': {
      const card = cardOf(event.detail);
      return card ? `${who} drew “${card.title}”: ${card.action}` : `${who} drew a card`;
    }
    case 'cannotBuyYet':
      return `${who} has to finish a lap before buying ${space}`;
    case 'noRentMortgaged':
      return `No rent on ${space}, it is mortgaged`;
    case 'noRentJail':
      return `No rent on ${space} while its owner is at the Visa Office`;
    case 'jackpot':
      return `${who} won the ${amount} jackpot`;
    case 'bought':
      return `${who} bought ${space} for ${amount}`;
    case 'declined':
      return `${who} passed on ${space}`;
    case 'auctionStarted':
      return `${space} is up for auction`;
    case 'bid':
      return `${who} bid ${amount}`;
    case 'droppedOut':
      return `${who} dropped out of the auction`;
    case 'auctionWon':
      return `${who} won ${space} for ${amount}`;
    case 'auctionUnsold':
      return `Nobody bought ${space}`;
    case 'built':
      return event.amount === 5 ? `${who} built a hotel on ${space}` : `${who} built a house on ${space}`;
    case 'sold':
      return `${who} sold a building on ${space}`;
    case 'mortgaged':
      return `${who} mortgaged ${space}`;
    case 'unmortgaged':
      return `${who} paid off the mortgage on ${space}`;
    case 'tradeProposed':
      return `${who} sent ${target} an offer`;
    case 'tradeAccepted':
      return `${target} accepted ${who}'s offer`;
    case 'tradeDeclined':
      return `${target} declined ${who}'s offer`;
    case 'tradeCountered':
      return `${target} replied to ${who} with a counter-offer`;
    case 'tradeCancelled':
      return event.detail === 'cancelled' ? `${who} withdrew an offer` : `An offer from ${who} was cancelled because something in it changed`;
    case 'turnStarted':
      return `${who}'s turn`;
    case 'bankrupt':
      return event.target ? `${who} went bankrupt to ${target}` : `${who} went bankrupt`;
    case 'left':
      return `${who} left the game`;
    case 'removed':
      return `The host removed ${who}`;
    case 'awayTimedOut':
      return `${who} did not come back in time`;
    case 'timerExpired':
      return `Time ran out for ${who}`;
    case 'disconnected':
      return `${who} lost connection`;
    case 'reconnected':
      return `${who} is back`;
    case 'voted':
      return `${who} voted to give ${target} more time`;
    case 'awayExtended':
      return `${who} got 5 more minutes to come back`;
    case 'paused':
      return 'The host paused the game';
    case 'resumed':
      return 'The game is running again';
    case 'endedByHost':
      return 'The host ended the game';
    case 'gameOver':
      return `Game over. ${(event.detail ?? '').split(',').filter(Boolean).map((id) => nameOf(game, id)).join(' and ')} won`;
    default:
      return null;
  }
}

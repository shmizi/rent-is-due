import { describe, expect, it } from 'vitest';
import { netWorth } from '../src/engine/netWorth.ts';
import { act, newGame, own, player, setDice, T0, types } from './support.ts';

const MINUTE = 60_000;

describe('debt', () => {
  function rentDebt() {
    const state = newGame(3);
    own(state, 'p2', [1, 3]);
    state.props[1]!.houses = 4;
    state.props[3]!.houses = 5;
    own(state, 'p1', [37]);
    player(state, 'p1').cash = 100;
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });
    return state;
  }

  it('records a debt instead of letting cash go negative, and blocks the turn', () => {
    const state = rentDebt();
    expect(state.debts).toEqual([{ debtor: 'p1', creditor: { kind: 'player', id: 'p2' }, amount: 210, reason: 'rent' }]);
    expect(player(state, 'p1').cash).toBe(100);
    expect(() => act(state, { type: 'endTurn', player: 'p1' })).toThrow('debt');
  });

  it('settles the debt as soon as the player raises the cash', () => {
    const state = rentDebt();
    act(state, { type: 'mortgage', player: 'p1', space: 37 });

    expect(state.debts).toEqual([]);
    expect(player(state, 'p1').cash).toBe(65);
    expect(player(state, 'p2').cash).toBe(1710);
  });

  it('only allows bankruptcy while in debt', () => {
    const state = newGame();
    expect(() => act(state, { type: 'declareBankruptcy', player: 'p1' })).toThrow('owe money');
  });
});

describe('bankruptcy', () => {
  it('hands everything to a single player creditor', () => {
    const state = newGame(3);
    own(state, 'p1', [37]);
    state.props[37]!.mortgaged = true;
    player(state, 'p1').cash = 40;
    player(state, 'p1').jailCards = ['wildcard'];
    state.decks.wildcard = state.decks.wildcard.filter((i) => i !== 6);
    state.debts.push({ debtor: 'p1', creditor: { kind: 'player', id: 'p2' }, amount: 300, reason: 'rent' });

    act(state, { type: 'declareBankruptcy', player: 'p1' });

    expect(player(state, 'p1').status).toBe('bankrupt');
    expect(state.props[37]).toEqual({ owner: 'p2', houses: 0, mortgaged: true });
    expect(player(state, 'p2').cash).toBe(1500 + 40 - 18);
    expect(player(state, 'p2').jailCards).toEqual(['wildcard']);
    expect(state.turn.player).toBe('p2');
  });

  it('frees the properties when the debt is to the bank', () => {
    const state = newGame(3);
    own(state, 'p1', [37, 39], 1);
    player(state, 'p1').cash = 50;
    player(state, 'p1').position = 35;
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });
    expect(state.debts[0]).toMatchObject({ debtor: 'p1', creditor: { kind: 'bank' }, amount: 100 });

    act(state, { type: 'declareBankruptcy', player: 'p1' });

    expect(state.props[37]).toEqual({ owner: null, houses: 0, mortgaged: false });
    expect(state.props[39]).toEqual({ owner: null, houses: 0, mortgaged: false });
    expect(state.status).toBe('playing');
    expect(state.turn.player).toBe('p2');
  });

  it('auctions the freed properties one by one with that setting', () => {
    const state = newGame(3, (s) => (s.bankruptProperties = 'auction'));
    own(state, 'p1', [37, 39]);
    state.debts.push({ debtor: 'p1', creditor: { kind: 'bank' }, amount: 5000, reason: 'tax' });

    act(state, { type: 'declareBankruptcy', player: 'p1' });

    expect(state.auction?.space).toBe(37);
    expect(state.auction?.bidders).toEqual(['p2', 'p3']);
    expect(state.auctionQueue).toEqual([39]);
  });

  it('rejects a late bid meant for the auction before', () => {
    const state = newGame(3, (s) => (s.bankruptProperties = 'auction'));
    own(state, 'p1', [37, 39]);
    state.debts.push({ debtor: 'p1', creditor: { kind: 'bank' }, amount: 5000, reason: 'tax' });
    act(state, { type: 'declareBankruptcy', player: 'p1' });
    const first = state.auction!.id;

    act(state, { type: 'dropOut', player: 'p2', auction: first });
    act(state, { type: 'dropOut', player: 'p3', auction: first });
    expect(state.auction?.space).toBe(39);

    expect(() => act(state, { type: 'bid', player: 'p2', auction: first, amount: 50 })).toThrow('ended');
    expect(() => act(state, { type: 'dropOut', player: 'p3', auction: first })).toThrow('ended');
    expect(state.auction!.highBidder).toBeNull();
    expect(state.auction!.bidders).toEqual(['p2', 'p3']);
  });

  it('splits the cash between several creditors', () => {
    const state = newGame(3);
    player(state, 'p1').cash = 50;
    state.debts.push({ debtor: 'p1', creditor: { kind: 'player', id: 'p2' }, amount: 60, reason: 'card' });
    state.debts.push({ debtor: 'p1', creditor: { kind: 'player', id: 'p3' }, amount: 40, reason: 'card' });

    act(state, { type: 'declareBankruptcy', player: 'p1' });

    expect(player(state, 'p2').cash).toBe(1530);
    expect(player(state, 'p3').cash).toBe(1520);
  });

  it('pays what it can to a player creditor when someone leaves', () => {
    const state = newGame(3);
    own(state, 'p1', [1]);
    player(state, 'p1').cash = 100;
    state.debts.push({ debtor: 'p1', creditor: { kind: 'player', id: 'p2' }, amount: 300, reason: 'rent' });

    act(state, { type: 'leave', player: 'p1' });

    expect(player(state, 'p1').status).toBe('left');
    expect(player(state, 'p2').cash).toBe(1600);
    expect(state.props[1]!.owner).toBeNull();
  });

  it('ends the game when one player is left', () => {
    const state = newGame(2);
    const events = act(state, { type: 'leave', player: 'p1' });

    expect(types(events)).toContain('gameOver');
    expect(state.status).toBe('finished');
    expect(state.winners).toEqual(['p2']);
  });
});

describe('timers', () => {
  it('rolls for the player when the step timer runs out', () => {
    const state = newGame();
    ownEverythingFor(state, 'p1');
    expect(state.timers.step?.deadline).toBe(T0 + MINUTE);

    const events = act(state, { type: 'tick' }, T0 + MINUTE);
    expect(types(events)).toEqual(expect.arrayContaining(['timerExpired', 'rolled']));
  });

  it('passes on the street when the buy timer runs out', () => {
    const state = newGame(3);
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });

    const events = act(state, { type: 'tick' }, T0 + MINUTE);
    expect(types(events)).toEqual(expect.arrayContaining(['declined', 'auctionStarted']));
  });

  it('pauses the step timer during an auction and resumes it after', () => {
    const state = newGame(2);
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });
    act(state, { type: 'decline', player: 'p1' });
    expect(state.timers.step?.deadline).toBeNull();

    act(state, { type: 'dropOut', player: 'p1', auction: 1 }, T0 + 2000);
    act(state, { type: 'dropOut', player: 'p2', auction: 1 }, T0 + 3000);
    expect(state.timers.step?.deadline).toBe(T0 + 3000 + MINUTE);
  });

  it('waits for an away player on their turn, then removes them', () => {
    const state = newGame(3);
    act(state, { type: 'disconnect', player: 'p1' });
    expect(state.timers.step?.deadline).toBeNull();
    expect(player(state, 'p1').away?.deadline).toBe(T0 + 5 * MINUTE);

    act(state, { type: 'tick' }, T0 + 5 * MINUTE - 1);
    expect(player(state, 'p1').status).toBe('active');

    const events = act(state, { type: 'tick' }, T0 + 5 * MINUTE);
    expect(types(events)).toEqual(expect.arrayContaining(['awayTimedOut', 'left']));
    expect(state.turn.player).toBe('p2');
  });

  it('clears the away state on reconnect', () => {
    const state = newGame(3);
    act(state, { type: 'disconnect', player: 'p2' });
    act(state, { type: 'reconnect', player: 'p2' }, T0 + MINUTE);
    expect(player(state, 'p2').away).toBeNull();
    expect(() => act(state, { type: 'roll', player: 'p2' })).toThrow('not your turn');
  });

  it('refuses actions from an away player', () => {
    const state = newGame(3);
    act(state, { type: 'disconnect', player: 'p1' });
    expect(() => act(state, { type: 'roll', player: 'p1' })).toThrow('away');
  });

  it('adds 5 minutes once a majority of connected players vote', () => {
    const state = newGame(4);
    act(state, { type: 'disconnect', player: 'p4' });

    const first = act(state, { type: 'voteExtend', player: 'p1', target: 'p4' });
    expect(types(first)).not.toContain('awayExtended');
    expect(() => act(state, { type: 'voteExtend', player: 'p1', target: 'p4' })).toThrow('already voted');

    const second = act(state, { type: 'voteExtend', player: 'p2', target: 'p4' });
    expect(types(second)).toContain('awayExtended');
    expect(player(state, 'p4').away?.deadline).toBe(T0 + 10 * MINUTE);
  });

  it('freezes everything while paused', () => {
    const state = newGame(3);
    act(state, { type: 'disconnect', player: 'p2' });
    act(state, { type: 'pause' });
    expect(() => act(state, { type: 'roll', player: 'p1' })).toThrow('paused');

    act(state, { type: 'tick' }, T0 + 10 * MINUTE);
    expect(player(state, 'p2').status).toBe('active');

    act(state, { type: 'resume' }, T0 + 2 * MINUTE);
    expect(player(state, 'p2').away?.deadline).toBe(T0 + 7 * MINUTE);
    expect(state.timers.step?.deadline).toBe(T0 + 3 * MINUTE);
  });

  it('gives a player who drops during a pause the normal away time once the game resumes', () => {
    const state = newGame(3);
    act(state, { type: 'pause' });
    act(state, { type: 'disconnect', player: 'p2' }, T0 + 3 * MINUTE);
    act(state, { type: 'resume' }, T0 + 10 * MINUTE);

    expect(player(state, 'p2').away?.deadline).toBe(T0 + 15 * MINUTE);
  });

  it('gives everyone a fresh away clock and at least 30 seconds after a restart', () => {
    const state = newGame(3);
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });
    act(state, { type: 'decline', player: 'p1' });

    act(state, { type: 'restore' }, T0 + 5000);

    expect(state.auction?.deadline).toBe(T0 + 35_000);
    for (const p of state.players) {
      expect(p.connected).toBe(false);
      expect(p.away?.deadline).toBe(T0 + 5000 + 5 * MINUTE);
    }
  });
});

describe('net worth and winning', () => {
  it('counts cash, printed prices, mortgages, buildings and debts', () => {
    const state = newGame();
    own(state, 'p1', [1, 3]);
    state.props[1]!.houses = 2;
    state.props[3]!.mortgaged = true;
    state.debts.push({ debtor: 'p1', creditor: { kind: 'bank' }, amount: 87, reason: 'test' });

    expect(netWorth(state, 'p1')).toBe(1500 + 60 + 100 + (60 - 33) - 87);
  });

  it('ends after the last turn of the final round with the richest player winning', () => {
    const state = newGame(2, (s) => (s.win = { mode: 'rounds', rounds: 5 }));
    state.round = 5;
    state.turn.player = 'p2';
    state.turn.phase = 'postRoll';
    player(state, 'p1').cash = 2000;

    act(state, { type: 'endTurn', player: 'p2' });

    expect(state.status).toBe('finished');
    expect(state.winners).toEqual(['p1']);
  });

  it('ends at the end of a turn once someone reaches the net worth target', () => {
    const state = newGame(2, (s) => (s.win = { mode: 'netWorth', target: 3000 }));
    player(state, 'p1').cash = 3100;
    state.turn.phase = 'postRoll';

    act(state, { type: 'endTurn', player: 'p1' });

    expect(state.status).toBe('finished');
    expect(state.winners).toEqual(['p1']);
  });

  it('lets the host end the game, with the richest player winning', () => {
    const state = newGame(3);
    own(state, 'p3', [39]);
    const events = act(state, { type: 'endGame' });

    expect(types(events)).toEqual(expect.arrayContaining(['endedByHost', 'gameOver']));
    expect(state.winners).toEqual(['p3']);
  });

  it('shares the win on an exact tie', () => {
    const state = newGame(2, (s) => (s.win = { mode: 'rounds', rounds: 5 }));
    state.round = 5;
    state.turn.player = 'p2';
    state.turn.phase = 'postRoll';

    act(state, { type: 'endTurn', player: 'p2' });
    expect(state.winners.sort()).toEqual(['p1', 'p2']);
  });
});

function ownEverythingFor(state: ReturnType<typeof newGame>, owner: string): void {
  state.props.forEach((prop, i) => {
    if (prop) state.props[i] = { owner, houses: 0, mortgaged: false };
  });
}

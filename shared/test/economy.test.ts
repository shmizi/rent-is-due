import { describe, expect, it } from 'vitest';
import { act, newGame, own, player, setDice, T0, types } from './support.ts';

const NOTHING = { properties: [], cash: 0, jailCards: 0 };

describe('building', () => {
  it('needs the whole colour set', () => {
    const state = newGame();
    own(state, 'p1', [1]);
    expect(() => act(state, { type: 'build', player: 'p1', space: 1 })).toThrow('whole colour set');
  });

  it('builds evenly across the set', () => {
    const state = newGame();
    own(state, 'p1', [1, 3]);

    act(state, { type: 'build', player: 'p1', space: 1 });
    expect(state.props[1]!.houses).toBe(1);
    expect(player(state, 'p1').cash).toBe(1450);

    expect(() => act(state, { type: 'build', player: 'p1', space: 1 })).toThrow('evenly');
    act(state, { type: 'build', player: 'p1', space: 3 });
    expect(state.props[3]!.houses).toBe(1);
  });

  it('allows uneven building when the even rule is off', () => {
    const state = newGame(2, (s) => (s.evenBuilding = false));
    own(state, 'p1', [1, 3]);
    act(state, { type: 'build', player: 'p1', space: 1 });
    act(state, { type: 'build', player: 'p1', space: 1 });
    expect(state.props[1]!.houses).toBe(2);
  });

  it('blocks building while any street in the set is mortgaged', () => {
    const state = newGame();
    own(state, 'p1', [1, 3]);
    act(state, { type: 'mortgage', player: 'p1', space: 3 });
    expect(() => act(state, { type: 'build', player: 'p1', space: 1 })).toThrow('mortgages');
  });

  it('stops at a hotel', () => {
    const state = newGame();
    own(state, 'p1', [1, 3], 5);
    expect(() => act(state, { type: 'build', player: 'p1', space: 1 })).toThrow('hotel');
  });

  it('sells evenly for half the cost', () => {
    const state = newGame();
    own(state, 'p1', [1, 3]);
    state.props[1]!.houses = 2;
    state.props[3]!.houses = 1;

    expect(() => act(state, { type: 'sellBuilding', player: 'p1', space: 3 })).toThrow('evenly');
    act(state, { type: 'sellBuilding', player: 'p1', space: 1 });
    expect(state.props[1]!.houses).toBe(1);
    expect(player(state, 'p1').cash).toBe(1525);
  });

  it('only builds on your own turn when that rule is on', () => {
    const state = newGame(2, (s) => (s.buildOnlyOwnTurn = true));
    own(state, 'p2', [1, 3]);
    expect(() => act(state, { type: 'build', player: 'p2', space: 1 })).toThrow('own turn');
  });
});

describe('mortgages', () => {
  it('pays half the price and charges 10% interest to lift it', () => {
    const state = newGame();
    own(state, 'p1', [39]);

    act(state, { type: 'mortgage', player: 'p1', space: 39 });
    expect(player(state, 'p1').cash).toBe(1700);

    act(state, { type: 'unmortgage', player: 'p1', space: 39 });
    expect(player(state, 'p1').cash).toBe(1480);
    expect(state.props[39]!.mortgaged).toBe(false);
  });

  it('refuses while the set has buildings', () => {
    const state = newGame();
    own(state, 'p1', [1, 3], 1);
    expect(() => act(state, { type: 'mortgage', player: 'p1', space: 1 })).toThrow('buildings');
  });
});

describe('auctions', () => {
  function auctionFor(players: number) {
    const state = newGame(players);
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });
    act(state, { type: 'decline', player: 'p1' });
    return state;
  }

  it('gives a late bid at least 5 more seconds', () => {
    const state = auctionFor(3);
    expect(state.auction!.deadline).toBe(T0 + 10_000);

    act(state, { type: 'bid', player: 'p2', auction: 1, amount: 50 }, T0 + 8000);
    expect(state.auction!.deadline).toBe(T0 + 13_000);
  });

  it('stops the top bidder dropping out and ends when everyone else has', () => {
    const state = auctionFor(3);
    act(state, { type: 'bid', player: 'p2', auction: 1, amount: 50 });
    expect(() => act(state, { type: 'dropOut', player: 'p2', auction: 1 })).toThrow('top bid');

    act(state, { type: 'dropOut', player: 'p1', auction: 1 });
    const events = act(state, { type: 'dropOut', player: 'p3', auction: 1 });

    expect(types(events)).toContain('auctionWon');
    expect(state.props[3]!.owner).toBe('p2');
    expect(player(state, 'p2').cash).toBe(1450);
    expect(state.auction).toBeNull();
  });

  it('rejects bids that are too low or more than the bidder has', () => {
    const state = auctionFor(2);
    act(state, { type: 'bid', player: 'p2', auction: 1, amount: 50 });
    expect(() => act(state, { type: 'bid', player: 'p1', auction: 1, amount: 50 })).toThrow('beat the top bid');
    expect(() => act(state, { type: 'bid', player: 'p1', auction: 1, amount: 5000 })).toThrow('more than your cash');
  });

  it('sells to the top bidder when the clock runs out', () => {
    const state = auctionFor(3);
    act(state, { type: 'bid', player: 'p3', auction: 1, amount: 30 }, T0 + 1000);
    act(state, { type: 'tick' }, T0 + 10_000);

    expect(state.props[3]!.owner).toBe('p3');
    expect(player(state, 'p3').cash).toBe(1470);
  });

  it('leaves the street unowned when nobody bids', () => {
    const state = auctionFor(2);
    act(state, { type: 'dropOut', player: 'p1', auction: 1 });
    act(state, { type: 'dropOut', player: 'p2', auction: 1 });

    expect(state.props[3]!.owner).toBeNull();
    expect(state.auction).toBeNull();
  });
});

describe('trades', () => {
  it('swaps cash for a mortgaged street and charges the receiver interest', () => {
    const state = newGame();
    own(state, 'p1', [1]);
    state.props[1]!.mortgaged = true;

    act(state, { type: 'proposeTrade', player: 'p2', to: 'p1', give: { properties: [], cash: 100, jailCards: 0 }, get: { properties: [1], cash: 0, jailCards: 0 } });
    act(state, { type: 'acceptTrade', player: 'p1', trade: 1 });

    expect(state.props[1]!.owner).toBe('p2');
    expect(player(state, 'p1').cash).toBe(1600);
    expect(player(state, 'p2').cash).toBe(1397);
    expect(state.trades).toEqual([]);
  });

  it('refuses streets from a set that has buildings', () => {
    const state = newGame();
    own(state, 'p1', [1, 3]);
    state.props[3]!.houses = 1;
    expect(() =>
      act(state, { type: 'proposeTrade', player: 'p1', to: 'p2', give: { properties: [1], cash: 0, jailCards: 0 }, get: NOTHING })
    ).toThrow('Sell the buildings');
  });

  it('cancels an offer when a street in it changes hands another way', () => {
    const state = newGame(3);
    own(state, 'p1', [1]);
    act(state, { type: 'proposeTrade', player: 'p1', to: 'p2', give: { properties: [1], cash: 0, jailCards: 0 }, get: { properties: [], cash: 10, jailCards: 0 } });
    act(state, { type: 'proposeTrade', player: 'p1', to: 'p3', give: { properties: [1], cash: 0, jailCards: 0 }, get: { properties: [], cash: 20, jailCards: 0 } });

    const events = act(state, { type: 'acceptTrade', player: 'p3', trade: 2 });

    expect(types(events)).toContain('tradeCancelled');
    expect(state.trades).toEqual([]);
    expect(state.props[1]!.owner).toBe('p3');
  });

  it('allows at most 5 open offers per player', () => {
    const state = newGame();
    const offer = { type: 'proposeTrade' as const, player: 'p1', to: 'p2', give: { properties: [], cash: 1, jailCards: 0 }, get: NOTHING };
    for (let i = 0; i < 5; i++) act(state, offer);
    expect(() => act(state, offer)).toThrow('at most 5');
  });

  it('keeps offers open indefinitely', () => {
    const state = newGame(2, (s) => (s.room.stepTimerSec = null));
    own(state, 'p1', [1]);
    act(state, { type: 'proposeTrade', player: 'p1', to: 'p2', give: { properties: [1], cash: 0, jailCards: 0 }, get: NOTHING });
    act(state, { type: 'tick' }, T0 + 7 * 24 * 3600 * 1000);
    expect(state.trades.length).toBe(1);
  });

  it('replaces an offer with a counter-offer', () => {
    const state = newGame();
    own(state, 'p1', [1]);
    act(state, { type: 'proposeTrade', player: 'p1', to: 'p2', give: { properties: [1], cash: 0, jailCards: 0 }, get: { properties: [], cash: 100, jailCards: 0 } });
    act(state, { type: 'counterTrade', player: 'p2', trade: 1, give: { properties: [], cash: 60, jailCards: 0 }, get: { properties: [1], cash: 0, jailCards: 0 } });

    expect(state.trades.map((t) => [t.id, t.from, t.to])).toEqual([[2, 'p2', 'p1']]);
  });

  it('checks the cash again on acceptance', () => {
    const state = newGame();
    own(state, 'p1', [1]);
    act(state, { type: 'proposeTrade', player: 'p2', to: 'p1', give: { properties: [], cash: 1000, jailCards: 0 }, get: { properties: [1], cash: 0, jailCards: 0 } });
    player(state, 'p2').cash = 500;
    expect(() => act(state, { type: 'acceptTrade', player: 'p1', trade: 1 })).toThrow('Not enough cash');
    expect(state.trades.length).toBe(1);
  });

  it('limits offers to your own turn and closes them when it ends, with the house rule', () => {
    const state = newGame(2, (s) => (s.tradeOnlyOwnTurn = true));
    expect(() =>
      act(state, { type: 'proposeTrade', player: 'p2', to: 'p1', give: { properties: [], cash: 5, jailCards: 0 }, get: NOTHING })
    ).toThrow('own turn');

    act(state, { type: 'proposeTrade', player: 'p1', to: 'p2', give: { properties: [], cash: 5, jailCards: 0 }, get: NOTHING });
    state.turn.phase = 'postRoll';
    act(state, { type: 'endTurn', player: 'p1' });

    expect(state.trades).toEqual([]);
    expect(state.turn.player).toBe('p2');
  });

  it('lets a player in debt trade off-turn even with the house rule', () => {
    const state = newGame(2, (s) => (s.tradeOnlyOwnTurn = true));
    state.debts.push({ debtor: 'p2', creditor: { kind: 'bank' }, amount: 5000, reason: 'test' });
    act(state, { type: 'proposeTrade', player: 'p2', to: 'p1', give: { properties: [], cash: 5, jailCards: 0 }, get: NOTHING });
    expect(state.trades.length).toBe(1);
  });
});

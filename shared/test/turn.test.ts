import { describe, expect, it } from 'vitest';
import { DECKS } from '../src/cards.ts';
import { rentFor } from '../src/engine/rent.ts';
import { act, newGame, own, ownEverything, player, setDice, T0, types } from './support.ts';

describe('moving and buying', () => {
  it('pays the salary when passing Start and offers the unowned street', () => {
    const state = newGame();
    player(state, 'p1').position = 38;
    setDice(state, [1, 2]);

    act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').position).toBe(1);
    expect(player(state, 'p1').cash).toBe(1700);
    expect(state.turn.phase).toBe('buyDecision');
    expect(state.turn.pendingBuy).toBe(1);
  });

  it('pays double salary for landing exactly on Start when that rule is on', () => {
    const state = newGame(2, (s) => (s.doubleSalaryOnStart = true));
    player(state, 'p1').position = 37;
    setDice(state, [1, 2]);

    act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').position).toBe(0);
    expect(player(state, 'p1').cash).toBe(1900);
  });

  it('buys the street for its price', () => {
    const state = newGame();
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });
    act(state, { type: 'buy', player: 'p1' });

    expect(state.props[3]!.owner).toBe('p1');
    expect(player(state, 'p1').cash).toBe(1440);
    expect(state.turn.phase).toBe('postRoll');
  });

  it('starts an auction when the street is passed', () => {
    const state = newGame(3);
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });
    const events = act(state, { type: 'decline', player: 'p1' });

    expect(types(events)).toContain('auctionStarted');
    expect(state.auction?.bidders).toEqual(['p1', 'p2', 'p3']);
    expect(() => act(state, { type: 'endTurn', player: 'p1' })).toThrow('auction');
  });

  it('blocks buying before the first lap with the lap rule', () => {
    const state = newGame(2, (s) => (s.lapBeforeBuying = true));
    setDice(state, [1, 2]);
    const events = act(state, { type: 'roll', player: 'p1' });

    expect(types(events)).toContain('cannotBuyYet');
    expect(state.turn.phase).toBe('postRoll');
  });

  it('makes a doubles roller roll again before ending the turn', () => {
    const state = newGame();
    ownEverything(state, 'p1');
    setDice(state, [3, 3]);
    act(state, { type: 'roll', player: 'p1' });

    expect(state.turn.canRollAgain).toBe(true);
    expect(() => act(state, { type: 'endTurn', player: 'p1' })).toThrow('roll again');
  });

  it('sends the player to Lockup on the third double without moving', () => {
    const state = newGame();
    ownEverything(state, 'p1');
    player(state, 'p1').position = 12;
    setDice(state, [1, 1, 2, 2, 3, 3]);

    act(state, { type: 'roll', player: 'p1' });
    expect(player(state, 'p1').position).toBe(14);
    act(state, { type: 'roll', player: 'p1' });
    expect(player(state, 'p1').position).toBe(18);
    act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').position).toBe(10);
    expect(player(state, 'p1').inJail).toBe(true);
    expect(state.turn.canRollAgain).toBe(false);
  });

  it('only lets the current player roll, and only once without doubles', () => {
    const state = newGame();
    ownEverything(state, 'p2');
    expect(() => act(state, { type: 'roll', player: 'p2' })).toThrow('not your turn');

    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });
    expect(() => act(state, { type: 'roll', player: 'p1' })).toThrow('already rolled');
  });
});

describe('taxes and the jackpot', () => {
  it('charges 10% of cash on Harbor Tax', () => {
    const state = newGame();
    player(state, 'p1').position = 1;
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').cash).toBe(1350);
  });

  it('charges the flat fee on Mooring Fee', () => {
    const state = newGame();
    player(state, 'p1').position = 35;
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').cash).toBe(1400);
  });

  it('sends taxes into the jackpot and pays it out on the Plaza', () => {
    const state = newGame(2, (s) => {
      s.jackpot.enabled = true;
      s.jackpot.seed = 50;
    });
    expect(state.jackpot).toBe(50);

    player(state, 'p1').position = 35;
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });
    expect(state.jackpot).toBe(150);

    player(state, 'p1').position = 17;
    state.turn = { ...state.turn, phase: 'preRoll', rolls: 0 };
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').cash).toBe(1400 + 150);
    expect(state.jackpot).toBe(50);
  });
});

describe('rent', () => {
  it('charges the base rent and doubles it on a full unbuilt set', () => {
    const state = newGame();
    own(state, 'p2', [3]);
    expect(rentFor(state, 3, { diceTotal: 3 })).toBe(4);

    own(state, 'p2', [1, 3]);
    expect(rentFor(state, 3, { diceTotal: 3 })).toBe(8);

    state.settings.doubleRentFullSet = false;
    expect(rentFor(state, 3, { diceTotal: 3 })).toBe(4);
  });

  it('uses the rent table once there are buildings', () => {
    const state = newGame();
    own(state, 'p2', [1, 3], 2);
    expect(rentFor(state, 3, { diceTotal: 3 })).toBe(55);
    state.props[3]!.houses = 5;
    expect(rentFor(state, 3, { diceTotal: 3 })).toBe(210);
  });

  it('charges nothing on a mortgaged property', () => {
    const state = newGame();
    own(state, 'p2', [3]);
    state.props[3]!.mortgaged = true;
    setDice(state, [1, 2]);
    const events = act(state, { type: 'roll', player: 'p1' });

    expect(types(events)).toContain('noRentMortgaged');
    expect(player(state, 'p1').cash).toBe(1500);
  });

  it('skips rent when the owner is in Lockup and rent in Lockup is off', () => {
    const state = newGame(2, (s) => (s.rentInJail = false));
    own(state, 'p2', [3]);
    player(state, 'p2').inJail = true;
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').cash).toBe(1500);
  });

  it('moves the rent from the lander to the owner', () => {
    const state = newGame();
    own(state, 'p2', [1, 3]);
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').cash).toBe(1492);
    expect(player(state, 'p2').cash).toBe(1508);
  });

  it('scales ferry rent with the number of ferries owned', () => {
    const state = newGame();
    own(state, 'p2', [5]);
    expect(rentFor(state, 5, { diceTotal: 7 })).toBe(25);
    own(state, 'p2', [5, 15, 25]);
    expect(rentFor(state, 5, { diceTotal: 7 })).toBe(100);
    expect(rentFor(state, 5, { diceTotal: 7, transitMultiplier: 2 })).toBe(200);
  });

  it('multiplies utility rent by the dice', () => {
    const state = newGame();
    own(state, 'p2', [12]);
    expect(rentFor(state, 12, { diceTotal: 7 })).toBe(28);
    own(state, 'p2', [12, 28]);
    expect(rentFor(state, 12, { diceTotal: 7 })).toBe(70);
  });
});

describe('Lockup', () => {
  function jailed(maxJailTurns = 3) {
    const state = newGame(2, (s) => (s.maxJailTurns = maxJailTurns));
    const p1 = player(state, 'p1');
    p1.position = 10;
    p1.inJail = true;
    return state;
  }

  it('lets the player pay the fine before rolling', () => {
    const state = jailed();
    act(state, { type: 'payJailFine', player: 'p1' });
    expect(player(state, 'p1').inJail).toBe(false);
    expect(player(state, 'p1').cash).toBe(1450);
  });

  it('lets the player use a get-out card, which goes back in the deck', () => {
    const state = jailed();
    const pass = DECKS.dispatch.cards.findIndex((c) => c.effect.type === 'jailCard');
    state.decks.dispatch = state.decks.dispatch.filter((i) => i !== pass);
    player(state, 'p1').jailCards = ['dispatch'];

    act(state, { type: 'useJailCard', player: 'p1' });

    expect(player(state, 'p1').inJail).toBe(false);
    expect(player(state, 'p1').jailCards).toEqual([]);
    expect(state.decks.dispatch).toContain(pass);
  });

  it('frees the player on doubles without another roll', () => {
    const state = jailed();
    setDice(state, [2, 2]);
    act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').inJail).toBe(false);
    expect(player(state, 'p1').position).toBe(14);
    expect(state.turn.canRollAgain).toBe(false);
  });

  it('keeps the player in after a failed roll', () => {
    const state = jailed();
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').inJail).toBe(true);
    expect(player(state, 'p1').jailTurns).toBe(1);
    expect(player(state, 'p1').position).toBe(10);
  });

  it('lets the player out free and moves them after the last allowed turn', () => {
    const state = jailed(1);
    setDice(state, [1, 2]);
    const events = act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').inJail).toBe(false);
    expect(player(state, 'p1').cash).toBe(1500);
    expect(player(state, 'p1').position).toBe(13);
    expect(events.find((e) => e.type === 'leftJail')?.detail).toBe('timeUp');
  });

  it('lets the player pay out after a failed roll or on another player’s turn', () => {
    const state = jailed();
    setDice(state, [1, 2]);
    act(state, { type: 'roll', player: 'p1' });
    act(state, { type: 'endTurn', player: 'p1' });
    expect(state.turn.player).toBe('p2');

    act(state, { type: 'payJailFine', player: 'p1' });

    expect(player(state, 'p1').inJail).toBe(false);
    expect(player(state, 'p1').cash).toBe(1450);
    expect(player(state, 'p1').position).toBe(10);
  });

  it('rejects the fine when the player is not in Lockup', () => {
    const state = newGame();
    expect(() => act(state, { type: 'payJailFine', player: 'p1' }, T0)).toThrow('not at the Visa Office');
  });
});

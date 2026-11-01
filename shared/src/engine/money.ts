import type { Creditor, GameEvent, GameState, PlayerState } from '../types.ts';
import { emit, findPlayer } from './helpers.ts';

export function receive(state: GameState, creditor: Creditor, amount: number): void {
  if (creditor.kind === 'player') {
    findPlayer(state, creditor.id).cash += amount;
  } else if (creditor.kind === 'jackpot') {
    state.jackpot += amount;
  } else {
    state.bankNet -= amount;
  }
}

export function payFromBank(state: GameState, player: PlayerState, amount: number): void {
  player.cash += amount;
  state.bankNet += amount;
}

export function payToBank(state: GameState, player: PlayerState, amount: number): void {
  player.cash -= amount;
  state.bankNet -= amount;
}

export function feeCreditor(state: GameState, source: 'taxes' | 'cardFines' | 'jailFines'): Creditor {
  const jackpot = state.settings.jackpot;
  return jackpot.enabled && jackpot[source] ? { kind: 'jackpot' } : { kind: 'bank' };
}

function creditorId(creditor: Creditor): string | undefined {
  return creditor.kind === 'player' ? creditor.id : undefined;
}

export function charge(
  state: GameState,
  debtor: PlayerState,
  creditor: Creditor,
  amount: number,
  reason: string,
  events: GameEvent[]
): void {
  if (amount <= 0) return;

  if (debtor.cash >= amount) {
    debtor.cash -= amount;
    receive(state, creditor, amount);
    emit(state, events, { type: 'paid', player: debtor.id, target: creditorId(creditor), amount, detail: reason });
    return;
  }

  state.debts.push({ debtor: debtor.id, creditor, amount, reason });
  emit(state, events, { type: 'debt', player: debtor.id, target: creditorId(creditor), amount, detail: reason });
}

export function settleDebts(state: GameState, events: GameEvent[]): void {
  let i = 0;
  while (i < state.debts.length) {
    const debt = state.debts[i];
    const waitingBehind = state.debts.slice(0, i).some((d) => d.debtor === debt.debtor);
    const debtor = findPlayer(state, debt.debtor);

    if (!waitingBehind && debtor.cash >= debt.amount) {
      debtor.cash -= debt.amount;
      receive(state, debt.creditor, debt.amount);
      state.debts.splice(i, 1);
      emit(state, events, { type: 'debtPaid', player: debtor.id, target: creditorId(debt.creditor), amount: debt.amount, detail: debt.reason });
      i = 0;
      continue;
    }

    i++;
  }
}

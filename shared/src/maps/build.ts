import type { SpaceDef } from '../types.ts';

function roundRent(value: number): number {
  return value < 50 ? value : Math.round(value / 5) * 5;
}

// rents[0] is the unbuilt rent, rents[1..4] are 1 to 4 houses, rents[5] is a hotel
export function ladder(base: number): number[] {
  return [base, roundRent(base * 5), roundRent(base * 14), roundRent(base * 32), roundRent(base * 42), roundRent(base * 52)];
}

// the unbuilt rent is 7% of the price
export function street(name: string, group: string, price: number): SpaceDef {
  return { kind: 'street', name, group, price, rents: ladder(Math.round(price * 0.07)) };
}

export const DISPATCH: SpaceDef = { kind: 'card', name: 'Treasure', deck: 'dispatch' };
export const WILDCARD: SpaceDef = { kind: 'card', name: 'Wildcard', deck: 'wildcard' };

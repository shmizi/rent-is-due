import type { GameState } from '../types.ts';
import { mapOf, ownsWholeGroup, propertySpace, propertyState } from './helpers.ts';

export interface RentContext {
  diceTotal: number;
  transitMultiplier?: number;
  utilityDice?: number;
}

export function rentFor(state: GameState, index: number, ctx: RentContext): number {
  const map = mapOf(state);
  const space = propertySpace(state, index);
  const prop = propertyState(state, index);

  if (prop.owner === null || prop.mortgaged) return 0;

  if (space.kind === 'street') {
    if (prop.houses > 0) return space.rents[prop.houses];
    const fullSet = ownsWholeGroup(state, prop.owner, space.group);
    return space.rents[0] * (fullSet && state.settings.doubleRentFullSet ? 2 : 1);
  }

  const owned = map.spaces.filter((s, i) => s.kind === space.kind && state.props[i]?.owner === prop.owner).length;

  if (space.kind === 'transit') {
    return map.transitRents[owned - 1] * (ctx.transitMultiplier ?? 1);
  }

  const multiplier = ctx.utilityDice ?? map.utilityMultipliers[owned - 1];
  return multiplier * ctx.diceTotal;
}

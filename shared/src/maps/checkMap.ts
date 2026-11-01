import type { CardTarget, DeckDef, DeckId, MapDef } from '../types.ts';

export function checkMap(map: MapDef, decks: Record<DeckId, DeckDef>): string[] {
  const errors: string[] = [];
  const n = map.spaces.length;

  if (n < 16 || n % 4 !== 0) errors.push(`Board size ${n} must be a multiple of 4 and at least 16.`);

  const corners: [number, string][] = [[0, 'start'], [n / 4, 'jail'], [n / 2, 'free'], [(3 * n) / 4, 'goToJail']];
  for (const [index, kind] of corners) {
    if (map.spaces[index]?.kind !== kind) errors.push(`Space ${index} must be the ${kind} corner.`);
  }

  for (const kind of ['start', 'jail', 'free', 'goToJail']) {
    const count = map.spaces.filter((s) => s.kind === kind).length;
    if (count !== 1) errors.push(`There must be exactly one ${kind} space, found ${count}.`);
  }

  const transits = map.spaces.filter((s) => s.kind === 'transit').length;
  if (transits !== 4) errors.push(`There must be 4 transit stops, found ${transits}.`);
  if (map.transitRents.length !== 4) errors.push('transitRents needs 4 values.');

  const utilities = map.spaces.filter((s) => s.kind === 'utility').length;
  if (utilities < 1) errors.push('There must be at least one utility.');
  if (map.utilityMultipliers.length !== utilities) errors.push('utilityMultipliers needs one value per utility.');

  if (map.maxPlayers < 2 || map.maxPlayers > 8) errors.push('maxPlayers must be between 2 and 8.');

  const groupOrder: string[] = [];
  const streetNames = new Set<string>();
  for (const space of map.spaces) {
    if (space.kind !== 'street') continue;

    if (!map.groups[space.group]) errors.push(`${space.name} uses unknown group ${space.group}.`);
    if (!groupOrder.includes(space.group)) groupOrder.push(space.group);
    if (streetNames.has(space.name)) errors.push(`Street name ${space.name} is used twice.`);
    streetNames.add(space.name);

    if (space.rents.length !== 6) errors.push(`${space.name} needs 6 rent values.`);
    for (let i = 1; i < space.rents.length; i++) {
      if (space.rents[i] <= space.rents[i - 1]) errors.push(`${space.name} rents must increase.`);
    }
  }

  for (const group of Object.keys(map.groups)) {
    const size = map.spaces.filter((s) => s.kind === 'street' && s.group === group).length;
    if (size < 2 || size > 4) errors.push(`Group ${group} has ${size} streets, it needs 2 to 4.`);
  }

  let previousMax = 0;
  for (const group of groupOrder) {
    const prices = map.spaces.flatMap((s) => (s.kind === 'street' && s.group === group ? [s.price] : []));
    if (Math.min(...prices) < previousMax) errors.push(`Group ${group} is cheaper than the group before it.`);
    previousMax = Math.max(...prices);
  }

  const deckIds = Object.keys(decks) as DeckId[];
  for (const space of map.spaces) {
    if (space.kind === 'card' && !deckIds.includes(space.deck)) errors.push(`${space.name} uses unknown deck ${space.deck}.`);
  }

  const needs: Record<CardTarget, boolean> = {
    start: true,
    priciestStreet: streetNames.size > 0,
    cheapestStreet: streetNames.size > 0,
    randomStreet: streetNames.size > 0,
    nearestTransit: transits > 0,
    nearestUtility: utilities > 0
  };

  for (const deck of deckIds) {
    for (const card of decks[deck].cards) {
      if (card.effect.type === 'moveTo' && !needs[card.effect.target]) {
        errors.push(`Card "${card.text}" needs a ${card.effect.target} space on this map.`);
      }
    }
  }

  return errors;
}

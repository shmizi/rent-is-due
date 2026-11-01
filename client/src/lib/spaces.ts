import type { GameView } from '../../../shared/src/view.ts';
import { money } from './format.ts';
import { groupStreets, mapFor, mortgageValue, playerById } from './game.ts';

export interface SpaceInfo {
  name: string;
  kindLabel: string;
  color: string;
  icon: string | null;
  price: number | null;
  status: string;
  ownerId: string | null;
  rows: { label: string; value: string; active?: boolean }[];
  footer: string | null;
  description: string | null;
}

const DESCRIPTIONS: Record<string, string> = {
  start: 'Collect your salary every time you pass.',
  jail: 'Just visiting, or serving time. Pay the fine, use a card or roll doubles to get out.',
  free: 'A free stop. With the jackpot rule on, landing here wins the jackpot.',
  goToJail: 'Go straight to Lockup. You don’t pass Start or collect your salary.'
};

export function spaceInfo(game: GameView, index: number): SpaceInfo {
  const map = mapFor(game);
  const space = map.spaces[index];
  const prop = game.props[index];
  const owner = playerById(game, prop?.owner);
  const s = game.settings;

  const base: SpaceInfo = {
    name: space.name,
    kindLabel: 'Space',
    color: '#3A4170',
    icon: null,
    price: null,
    status: '',
    ownerId: prop?.owner ?? null,
    rows: [],
    footer: null,
    description: DESCRIPTIONS[space.kind] ?? null
  };

  if (prop) {
    base.status = owner ? `Owned by ${owner.name}` : 'Unowned';
    if (prop.houses === 5) base.status += ', hotel';
    else if (prop.houses > 0) base.status += `, ${prop.houses} house${prop.houses > 1 ? 's' : ''}`;
    if (prop.mortgaged) base.status += ', mortgaged';
  }

  if (space.kind === 'street') {
    const group = map.groups[space.group];
    const fullSet = !!prop?.owner && groupStreets(map, space.group).every((i) => game.props[i]?.owner === prop.owner);
    const houses = prop?.houses ?? 0;
    return {
      ...base,
      kindLabel: `${group.name} set`,
      color: group.color,
      icon: group.icon,
      price: space.price,
      rows: [
        { label: 'Rent', value: money(space.rents[0]), active: houses === 0 && !fullSet },
        ...(s.doubleRentFullSet ? [{ label: 'Full set, unbuilt', value: money(space.rents[0] * 2), active: houses === 0 && fullSet }] : []),
        { label: '1 house', value: money(space.rents[1]), active: houses === 1 },
        { label: '2 houses', value: money(space.rents[2]), active: houses === 2 },
        { label: '3 houses', value: money(space.rents[3]), active: houses === 3 },
        { label: '4 houses', value: money(space.rents[4]), active: houses === 4 },
        { label: 'Hotel', value: money(space.rents[5]), active: houses === 5 }
      ],
      footer: `Houses ${money(group.houseCost)} each. Mortgage value ${money(mortgageValue(game, index))}.`,
      description: null
    };
  }

  if (space.kind === 'transit') {
    const owned = prop?.owner ? map.spaces.filter((x, i) => x.kind === 'transit' && game.props[i]?.owner === prop.owner).length : 0;
    return {
      ...base,
      kindLabel: 'Ferry',
      icon: 'transit',
      price: space.price,
      rows: map.transitRents.map((rent, i) => ({ label: i === 0 ? '1 ferry owned' : i === 3 ? 'All 4 ferries' : `${i + 1} ferries`, value: money(rent), active: owned === i + 1 })),
      footer: `Mortgage value ${money(mortgageValue(game, index))}.`,
      description: null
    };
  }

  if (space.kind === 'utility') {
    return {
      ...base,
      kindLabel: 'Utility',
      icon: 'utility',
      price: space.price,
      rows: map.utilityMultipliers.map((m, i) => ({ label: i === 0 ? 'One utility owned' : 'Both utilities', value: `${m}× the dice` })),
      footer: `Mortgage value ${money(mortgageValue(game, index))}.`,
      description: null
    };
  }

  if (space.kind === 'card') return { ...base, kindLabel: 'Card space', description: `Draw a ${space.name} card and do what it says.` };

  if (space.kind === 'tax') {
    const text =
      space.tax.type === 'flat'
        ? `Pay a flat ${money(space.tax.amount)} to the bank.`
        : s.incomeTax.mode === 'percent'
          ? `Pay ${s.incomeTax.percent}% of the cash you are holding.`
          : `Pay a flat ${money(s.incomeTax.amount)}.`;
    return { ...base, kindLabel: 'Tax', description: s.jackpot.enabled && s.jackpot.taxes ? `${text} It goes into the jackpot.` : text };
  }

  return { ...base, kindLabel: 'Corner' };
}

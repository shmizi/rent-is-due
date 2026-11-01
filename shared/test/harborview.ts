import type { MapDef, SpaceDef } from '../src/types.ts';

function roundRent(value: number): number {
  return value < 50 ? value : Math.round(value / 5) * 5;
}

// rents[0] is the unbuilt rent, rents[1..4] are 1 to 4 houses, rents[5] is a hotel
function ladder(base: number): number[] {
  return [base, roundRent(base * 5), roundRent(base * 14), roundRent(base * 32), roundRent(base * 42), roundRent(base * 52)];
}

// the unbuilt rent is 7% of the price
function street(name: string, group: string, price: number): SpaceDef {
  return { kind: 'street', name, group, price, rents: ladder(Math.round(price * 0.07)) };
}

export const HARBORVIEW: MapDef = {
  id: 'harborview',
  name: 'Harborview',
  maxPlayers: 8,
  groups: {
    brown: { name: 'Mudflats', color: '#8B5A3C', icon: 'circle', houseCost: 50 },
    sky: { name: 'Gull Coast', color: '#5BBCF0', icon: 'triangle', houseCost: 50 },
    pink: { name: 'Coral Bay', color: '#F06BAA', icon: 'square', houseCost: 100 },
    orange: { name: 'Lantern', color: '#F7923A', icon: 'diamond', houseCost: 100 },
    red: { name: 'Dockside', color: '#E5484D', icon: 'plus', houseCost: 150 },
    yellow: { name: 'Sunbeam', color: '#F5C842', icon: 'hexagon', houseCost: 150 },
    green: { name: 'Kelp Point', color: '#2FA36B', icon: 'cross', houseCost: 200 },
    navy: { name: 'Crown', color: '#3D5AFE', icon: 'bars', houseCost: 200 }
  },
  spaces: [
    { kind: 'start', name: 'Start' },
    street('Mudflat Lane', 'brown', 60),
    { kind: 'card', name: 'Dispatch', deck: 'dispatch' },
    street('Netmaker Row', 'brown', 60),
    { kind: 'tax', name: 'Harbor Tax', tax: { type: 'income' } },
    { kind: 'transit', name: 'North Ferry', price: 200 },
    street('Gull Street', 'sky', 100),
    { kind: 'card', name: 'Wildcard', deck: 'wildcard' },
    street('Saltbox Road', 'sky', 100),
    street('Tidewater Way', 'sky', 120),
    { kind: 'jail', name: 'Lockup' },
    street('Coral Court', 'pink', 140),
    { kind: 'utility', name: 'Tide Power', price: 150 },
    street('Shell Gardens', 'pink', 140),
    street('Pearl Avenue', 'pink', 160),
    { kind: 'transit', name: 'East Ferry', price: 200 },
    street('Lantern Quay', 'orange', 180),
    { kind: 'card', name: 'Dispatch', deck: 'dispatch' },
    street('Rope Walk', 'orange', 180),
    street('Chandler Street', 'orange', 200),
    { kind: 'free', name: 'Plaza' },
    street('Dockside Row', 'red', 220),
    { kind: 'card', name: 'Wildcard', deck: 'wildcard' },
    street('Anchor Street', 'red', 220),
    street('Mariner Square', 'red', 240),
    { kind: 'transit', name: 'South Ferry', price: 200 },
    street('Sunbeam Terrace', 'yellow', 260),
    street('Goldcrest Lane', 'yellow', 260),
    { kind: 'utility', name: 'Reservoir', price: 150 },
    street('Harvest Hill', 'yellow', 280),
    { kind: 'goToJail', name: 'Busted!' },
    street('Kelp Park', 'green', 300),
    street('Seagrass Row', 'green', 300),
    { kind: 'card', name: 'Dispatch', deck: 'dispatch' },
    street('Lighthouse Rise', 'green', 320),
    { kind: 'transit', name: 'West Ferry', price: 200 },
    { kind: 'card', name: 'Wildcard', deck: 'wildcard' },
    street('Admiral Heights', 'navy', 350),
    { kind: 'tax', name: 'Mooring Fee', tax: { type: 'flat', amount: 100 } },
    street('Crown Point', 'navy', 400)
  ],
  transitRents: [25, 50, 100, 200],
  utilityMultipliers: [4, 10]
};

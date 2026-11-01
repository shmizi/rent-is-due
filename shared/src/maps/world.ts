import type { GroupDef, MapDef } from '../types.ts';
import { DISPATCH, street, WILDCARD } from './build.ts';

export const COUNTRIES: Record<string, Omit<GroupDef, 'houseCost'>> = {
  br: { name: 'Brazil', color: '#1FA34A', icon: 'circle', flag: 'br' },
  in: { name: 'India', color: '#F28C28', icon: 'triangle', flag: 'in' },
  ru: { name: 'Russia', color: '#3A5BC7', icon: 'square', flag: 'ru' },
  cn: { name: 'China', color: '#DE2910', icon: 'diamond', flag: 'cn' },
  it: { name: 'Italy', color: '#1E9E5A', icon: 'plus', flag: 'it' },
  il: { name: 'Israel', color: '#2F6FDE', icon: 'hexagon', flag: 'il' },
  fr: { name: 'France', color: '#3D5AFE', icon: 'cross', flag: 'fr' },
  jp: { name: 'Japan', color: '#D9354A', icon: 'circle', flag: 'jp' },
  gb: { name: 'United Kingdom', color: '#2B3A8C', icon: 'bars', flag: 'gb' },
  us: { name: 'United States', color: '#B22234', icon: 'triangle', flag: 'us' }
};

export function countries(houseCosts: Record<string, number>): Record<string, GroupDef> {
  return Object.fromEntries(Object.entries(houseCosts).map(([code, houseCost]) => [code, { ...COUNTRIES[code], houseCost }]));
}

export const WORLD: MapDef = {
  id: 'world',
  name: 'World',
  maxPlayers: 8,
  groups: countries({ br: 50, in: 50, cn: 100, it: 100, il: 150, jp: 150, gb: 200, us: 200 }),
  spaces: [
    { kind: 'start', name: 'Start' },
    street('Rio de Janeiro', 'br', 60),
    DISPATCH,
    street('São Paulo', 'br', 60),
    { kind: 'tax', name: 'Departure Tax', tax: { type: 'income' } },
    { kind: 'transit', name: 'Dubai Airport', price: 200 },
    street('Bengaluru', 'in', 100),
    WILDCARD,
    street('Delhi', 'in', 100),
    street('Mumbai', 'in', 120),
    { kind: 'jail', name: 'Visa Office' },
    street('Shenzhen', 'cn', 140),
    { kind: 'utility', name: 'Power Grid', price: 150 },
    street('Shanghai', 'cn', 140),
    street('Beijing', 'cn', 160),
    { kind: 'transit', name: 'Singapore Airport', price: 200 },
    street('Naples', 'it', 180),
    DISPATCH,
    street('Venice', 'it', 180),
    street('Rome', 'it', 200),
    { kind: 'free', name: 'Layover' },
    street('Haifa', 'il', 220),
    WILDCARD,
    street('Jerusalem', 'il', 220),
    street('Tel Aviv', 'il', 240),
    { kind: 'transit', name: 'Istanbul Airport', price: 200 },
    street('Kyoto', 'jp', 260),
    DISPATCH,
    { kind: 'utility', name: 'Hotel Wi-Fi', price: 150 },
    street('Tokyo', 'jp', 280),
    { kind: 'goToJail', name: 'Deported!' },
    street('Birmingham', 'gb', 300),
    street('Manchester', 'gb', 300),
    WILDCARD,
    street('London', 'gb', 320),
    { kind: 'transit', name: 'Sydney Airport', price: 200 },
    street('Miami', 'us', 340),
    street('Los Angeles', 'us', 360),
    { kind: 'tax', name: 'Customs', tax: { type: 'flat', amount: 100 } },
    street('New York', 'us', 400)
  ],
  transitRents: [25, 50, 100, 200],
  utilityMultipliers: [4, 10]
};

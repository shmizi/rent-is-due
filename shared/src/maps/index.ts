import type { MapDef } from '../types.ts';
import { WORLD } from './world.ts';
import { WORLD_TOUR } from './worldTour.ts';

export const MAPS: Record<string, MapDef> = {
  world: WORLD,
  worldTour: WORLD_TOUR
};

export function getMap(id: string): MapDef {
  const map = MAPS[id];
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}

import type { MapDef } from '../types.ts';
import { HARBORVIEW } from './harborview.ts';
import { WORLD } from './world.ts';
import { WORLD_TOUR } from './worldTour.ts';

export const MAPS: Record<string, MapDef> = {
  world: WORLD,
  worldTour: WORLD_TOUR
};

export const RETIRED_MAPS: Record<string, MapDef> = {
  harborview: HARBORVIEW
};

export function getMap(id: string): MapDef {
  const map = Object.hasOwn(MAPS, id) ? MAPS[id] : Object.hasOwn(RETIRED_MAPS, id) ? RETIRED_MAPS[id] : undefined;
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}

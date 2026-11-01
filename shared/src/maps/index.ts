import type { MapDef } from '../types.ts';
import { HARBORVIEW } from './harborview.ts';

export const MAPS: Record<string, MapDef> = {
  harborview: HARBORVIEW
};

export function getMap(id: string): MapDef {
  const map = MAPS[id];
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}

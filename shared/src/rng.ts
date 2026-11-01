export interface RngHolder {
  rng: number;
}

// mulberry32: rng is the 32-bit generator state, the result is uniform in [0, 1)
export function random(holder: RngHolder): number {
  holder.rng = (holder.rng + 0x6d2b79f5) | 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(holder: RngHolder, min: number, max: number): number {
  return min + Math.floor(random(holder) * (max - min + 1));
}

export function rollDie(holder: RngHolder): number {
  return randomInt(holder, 1, 6);
}

export function shuffle<T>(holder: RngHolder, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(holder, 0, i);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }

  return items;
}

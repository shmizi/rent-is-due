type Area = 'local' | 'session';

function area(kind: Area): Storage {
  return kind === 'local' ? localStorage : sessionStorage;
}

export function readStored(kind: Area, key: string): string | null {
  try {
    return area(kind).getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(kind: Area, key: string, value: string): void {
  try {
    area(kind).setItem(key, value);
  } catch {
    return;
  }
}

export function removeStored(kind: Area, key: string): void {
  try {
    area(kind).removeItem(key);
  } catch {
    return;
  }
}

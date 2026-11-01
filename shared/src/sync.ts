export type PatchPath = (string | number)[];

export type PatchOp = { p: PatchPath; v: unknown } | { p: PatchPath; d: true };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function walk(a: unknown, b: unknown, path: PatchPath, ops: PatchOp[]): void {
  if (a === b) return;

  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < b.length; i++) walk(a[i], b[i], [...path, i], ops);
    return;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    for (const key of Object.keys(b)) {
      if (b[key] === undefined) continue;
      if (!(key in a) || a[key] === undefined) ops.push({ p: [...path, key], v: b[key] });
      else walk(a[key], b[key], [...path, key], ops);
    }
    for (const key of Object.keys(a)) {
      if (a[key] !== undefined && (!(key in b) || b[key] === undefined)) ops.push({ p: [...path, key], d: true });
    }
    return;
  }

  ops.push({ p: path, v: b });
}

// Both values must be plain JSON data. The result turns a copy of `a` into `b`.
export function diff(a: unknown, b: unknown): PatchOp[] {
  const ops: PatchOp[] = [];
  walk(a, b, [], ops);
  return ops;
}

export function applyPatch<T>(target: T, ops: PatchOp[]): T {
  let root: unknown = target;

  for (const op of ops) {
    if (op.p.length === 0) {
      if ('d' in op) throw new Error('Cannot delete the root');
      root = structuredClone(op.v);
      continue;
    }

    let parent = root as Record<string | number, unknown>;
    for (const key of op.p.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>;

    const last = op.p[op.p.length - 1];
    if ('d' in op) delete parent[last];
    else parent[last] = structuredClone(op.v);
  }

  return root as T;
}

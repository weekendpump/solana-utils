import { IMap, PickByType, SortableTypes } from "../types/helper-types";

export function truncateString(input: string, maxLength = 30, suffix = "...") {
  if (input.length > maxLength) {
    return `${input.substring(0, maxLength)}${suffix}`;
  }
  return input;
}

export function chunks<T>(array: T[], size: number): T[][] {
  return Array.apply(0, new Array(Math.ceil(array.length / size))).map(
    (_, index) => array.slice(index * size, (index + 1) * size)
  );
}

export function unique<T>(arr: T[]) {
  return [...new Set(arr)];
}

export function uniqueBy<T>(
  arr: T[],
  selector: keyof PickByType<T, number | string, true>
): T[] {
  const results: IMap<T> = {};
  arr.forEach((a) => {
    const key = a[selector] as unknown as string;
    results[key] = a;
  });
  return Object.values(results);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sumBy<T>(
  arr: T[],
  selector: keyof PickByType<T, number, true>
): number {
  const result = arr.reduce(
    (sum, current) => sum + (current[selector] as unknown as number),
    0
  );
  return result;
}

export function minBy<T>(
  arr: T[],
  selector: keyof PickByType<T, number, true>
): number {
  const definedArr = arr
    .map((x) => x[selector] as unknown as number)
    .filter((x) => Boolean(x));
  return Math.min(...definedArr);
}

export function maxBy<T>(
  arr: T[],
  selector: keyof PickByType<T, number, true>
): number {
  const definedArr = arr
    .map((x) => x[selector] as unknown as number)
    .filter((x) => Boolean(x));
  return Math.max(...definedArr);
}

export function mapify<T>(
  arr: T[],
  selector: keyof PickByType<T, string | number, true>
): IMap<T> {
  const result: IMap<T> = {};
  arr.forEach((a) => {
    const key = a[selector] as unknown as string;
    result[key] = a;
  });
  return result;
}

export function mapifyValues(arr: string[]): IMap<boolean> {
  const result: IMap<boolean> = {};
  arr.forEach((a) => {
    result[a] = true;
  });
  return result;
}

export function sortBy<T>(
  arr: T[],
  selector: keyof PickByType<T, SortableTypes, true>,
  reverse = false
) {
  return arr.sort((a: T, b: T) => {
    if (a[selector] === b[selector]) {
      return 0;
    }

    return (a[selector] > b[selector] ? -1 : 1) * (reverse ? -1 : 1);
  });
}

export function sortBySelector<T>(
  arr: T[],
  selector: (x: T) => SortableTypes,
  reverse = false
) {
  return arr.sort((a: T, b: T) => {
    if (selector(a) === selector(b)) {
      return 0;
    }

    return (selector(a) > selector(b) ? -1 : 1) * (reverse ? -1 : 1);
  });
}

export function pickByIndex<T>(arr: T[], indices: number[]): T[] {
  const result: T[] = [];
  for (const i of indices) {
    if (i >= arr.length) {
      continue;
    }
    result.push(arr[i]);
  }
  return result;
}

export function hashStable(s: string): string {
  let hash = 0,
    i: number,
    chr: number;
  if (s.length === 0) return hash.toString();
  for (i = 0; i < s.length; i++) {
    chr = s.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
}

export function camelize(s: string): string {
  if (!s) {
    return s;
  }
  const l = s[0].toLowerCase();
  return l + s.substring(1);
}

export function safePush<T>(o: IMap<T[]>, key: string, val: T): IMap<T[]> {
  if (!o) {
    o = {};
  }
  if (!o[key]) {
    o[key] = [];
  }
  o[key].push(val);
  return o;
}

/** Usually just a helper function to have the counters sorted */
export function sortCounters(obj: IMap<number>, desc = true) {
  const tuples = Object.entries(obj);
  const sortedTuples = tuples.sort(([, a], [, b]) => (desc ? b - a : a - b));
  return Object.fromEntries(sortedTuples);
}

export function sortMapKeys<T>(
  obj: IMap<T>,
  selector: (x: T) => SortableTypes,
  reverse = true
) {
  const tuples = Object.entries(obj);
  const sortedTuples = tuples.sort(
    ([, a], [, b]) => (selector(a) > selector(b) ? -1 : 1) * (reverse ? -1 : 1)
  );
  return Object.fromEntries(sortedTuples);
}

/** Helper function that returns a number of keys of an object */
export function keyl(obj: unknown, falsyValue = 0): number {
  if (!obj) {
    return falsyValue;
  }
  return Object.keys(obj)?.length;
}

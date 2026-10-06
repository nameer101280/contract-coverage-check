/**
 * A small deterministic pseudo-random source, so the mock data needs no
 * dependency and looks the same on every load.
 */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

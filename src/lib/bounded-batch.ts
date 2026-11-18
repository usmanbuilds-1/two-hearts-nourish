/** Bound external data-provider concurrency without changing input ordering. */
export async function mapInBatches<T, R>(
  inputs: T[],
  batchSize: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 16) {
    throw new Error("INVALID_BATCH_SIZE");
  }
  const out: R[] = [];
  for (let i = 0; i < inputs.length; i += batchSize) {
    out.push(...await Promise.all(inputs.slice(i, i + batchSize).map(worker)));
  }
  return out;
}

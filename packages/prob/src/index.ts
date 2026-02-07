export type DistributionMap = ReadonlyMap<number, number>;

export interface DistributionEntry {
  readonly outcome: number;
  readonly probability: number;
}

export interface ProbabilityDistribution {
  readonly map: DistributionMap;
  readonly entries: readonly DistributionEntry[];
  readonly totalProbability: number;
}

interface DenseDistribution {
  readonly offset: number;
  readonly values: Float64Array;
}

const PROBABILITY_EPSILON = 1e-15;

function normalize(entries: readonly DistributionEntry[]): ProbabilityDistribution {
  const map = new Map<number, number>();

  for (const entry of entries) {
    const existing = map.get(entry.outcome) ?? 0;
    map.set(entry.outcome, existing + entry.probability);
  }

  const sortedEntries = Array.from(map.entries())
    .map(([outcome, probability]) => ({ outcome, probability }))
    .sort((left, right) => left.outcome - right.outcome);

  const totalProbability = sortedEntries.reduce(
    (sum, entry) => sum + entry.probability,
    0
  );

  return {
    map,
    entries: sortedEntries,
    totalProbability
  };
}

function toDense(distribution: ProbabilityDistribution): DenseDistribution {
  if (distribution.entries.length === 0) {
    return {
      offset: 0,
      values: new Float64Array(1)
    };
  }

  const firstOutcome = distribution.entries[0]?.outcome;
  const lastOutcome = distribution.entries[distribution.entries.length - 1]?.outcome;

  if (firstOutcome === undefined || lastOutcome === undefined) {
    return {
      offset: 0,
      values: new Float64Array(1)
    };
  }

  const values = new Float64Array(lastOutcome - firstOutcome + 1);
  for (const entry of distribution.entries) {
    values[entry.outcome - firstOutcome] = entry.probability;
  }

  return {
    offset: firstOutcome,
    values
  };
}

function fromDense(distribution: DenseDistribution): ProbabilityDistribution {
  const entries: DistributionEntry[] = [];

  for (let index = 0; index < distribution.values.length; index += 1) {
    const probability = distribution.values[index] ?? 0;
    if (Math.abs(probability) <= PROBABILITY_EPSILON) {
      continue;
    }

    entries.push({
      outcome: distribution.offset + index,
      probability
    });
  }

  return normalize(entries);
}

function convolveDense(left: DenseDistribution, right: DenseDistribution): DenseDistribution {
  const values = new Float64Array(left.values.length + right.values.length - 1);

  for (let leftIndex = 0; leftIndex < left.values.length; leftIndex += 1) {
    const leftProbability = left.values[leftIndex] ?? 0;
    if (Math.abs(leftProbability) <= PROBABILITY_EPSILON) {
      continue;
    }

    for (let rightIndex = 0; rightIndex < right.values.length; rightIndex += 1) {
      const rightProbability = right.values[rightIndex] ?? 0;
      if (Math.abs(rightProbability) <= PROBABILITY_EPSILON) {
        continue;
      }

      values[leftIndex + rightIndex] += leftProbability * rightProbability;
    }
  }

  return {
    offset: left.offset + right.offset,
    values
  };
}

export function fromEntries(entries: readonly DistributionEntry[]): ProbabilityDistribution {
  return normalize(entries);
}

export function constant(value: number): ProbabilityDistribution {
  return normalize([{ outcome: value, probability: 1 }]);
}

export function uniformDie(sides: number): ProbabilityDistribution {
  if (!Number.isInteger(sides) || sides <= 0) {
    throw new Error("sides must be a positive integer");
  }

  const probability = 1 / sides;
  const entries: DistributionEntry[] = [];

  for (let face = 1; face <= sides; face += 1) {
    entries.push({ outcome: face, probability });
  }

  return normalize(entries);
}

export function shift(
  distribution: ProbabilityDistribution,
  amount: number
): ProbabilityDistribution {
  return normalize(
    distribution.entries.map((entry) => ({
      outcome: entry.outcome + amount,
      probability: entry.probability
    }))
  );
}

export function scaleOutcomes(
  distribution: ProbabilityDistribution,
  factor: number
): ProbabilityDistribution {
  return normalize(
    distribution.entries.map((entry) => ({
      outcome: entry.outcome * factor,
      probability: entry.probability
    }))
  );
}

export function mapOutcomes(
  distribution: ProbabilityDistribution,
  transform: (outcome: number) => number
): ProbabilityDistribution {
  return normalize(
    distribution.entries.map((entry) => ({
      outcome: transform(entry.outcome),
      probability: entry.probability
    }))
  );
}

export function convolve(
  left: ProbabilityDistribution,
  right: ProbabilityDistribution
): ProbabilityDistribution {
  return fromDense(convolveDense(toDense(left), toDense(right)));
}

export function multiplyIndependent(
  left: ProbabilityDistribution,
  right: ProbabilityDistribution
): ProbabilityDistribution {
  const entries: DistributionEntry[] = [];

  for (const leftEntry of left.entries) {
    for (const rightEntry of right.entries) {
      entries.push({
        outcome: leftEntry.outcome * rightEntry.outcome,
        probability: leftEntry.probability * rightEntry.probability
      });
    }
  }

  return normalize(entries);
}

export function repeatConvolve(
  base: ProbabilityDistribution,
  times: number
): ProbabilityDistribution {
  if (!Number.isInteger(times) || times < 0) {
    throw new Error("times must be a non-negative integer");
  }

  if (times === 0) {
    return constant(0);
  }

  const denseBase = toDense(base);
  let result: DenseDistribution = {
    offset: 0,
    values: new Float64Array([1])
  };

  for (let i = 0; i < times; i += 1) {
    result = convolveDense(result, denseBase);
  }

  return fromDense(result);
}

export function expectation(distribution: ProbabilityDistribution): number {
  return distribution.entries.reduce(
    (sum, entry) => sum + entry.outcome * entry.probability,
    0
  );
}

export function probabilityAtLeast(
  distribution: ProbabilityDistribution,
  threshold: number
): number {
  return distribution.entries
    .filter((entry) => entry.outcome >= threshold)
    .reduce((sum, entry) => sum + entry.probability, 0);
}

export function probabilityAtMost(
  distribution: ProbabilityDistribution,
  threshold: number
): number {
  return distribution.entries
    .filter((entry) => entry.outcome <= threshold)
    .reduce((sum, entry) => sum + entry.probability, 0);
}

export function maxOfIndependent(
  distribution: ProbabilityDistribution,
  count: number
): ProbabilityDistribution {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("count must be a positive integer");
  }

  if (count === 1) {
    return distribution;
  }

  const entries: DistributionEntry[] = [];
  let previousCdf = 0;
  let cumulative = 0;

  for (const entry of distribution.entries) {
    cumulative += entry.probability;
    const currentCdf = cumulative;
    const probability = Math.pow(currentCdf, count) - Math.pow(previousCdf, count);

    entries.push({
      outcome: entry.outcome,
      probability
    });

    previousCdf = currentCdf;
  }

  return fromEntries(entries);
}

export function minOfIndependent(
  distribution: ProbabilityDistribution,
  count: number
): ProbabilityDistribution {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("count must be a positive integer");
  }

  if (count === 1) {
    return distribution;
  }

  const entries: DistributionEntry[] = [];
  let previousCdf = 0;
  let cumulative = 0;

  for (const entry of distribution.entries) {
    cumulative += entry.probability;
    const currentCdf = cumulative;
    const probability = Math.pow(1 - previousCdf, count) - Math.pow(1 - currentCdf, count);

    entries.push({
      outcome: entry.outcome,
      probability
    });

    previousCdf = currentCdf;
  }

  return fromEntries(entries);
}

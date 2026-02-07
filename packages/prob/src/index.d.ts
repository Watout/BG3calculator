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
export declare function fromEntries(entries: readonly DistributionEntry[]): ProbabilityDistribution;
export declare function constant(value: number): ProbabilityDistribution;
export declare function uniformDie(sides: number): ProbabilityDistribution;
export declare function shift(distribution: ProbabilityDistribution, amount: number): ProbabilityDistribution;
export declare function scaleOutcomes(distribution: ProbabilityDistribution, factor: number): ProbabilityDistribution;
export declare function mapOutcomes(distribution: ProbabilityDistribution, transform: (outcome: number) => number): ProbabilityDistribution;
export declare function convolve(left: ProbabilityDistribution, right: ProbabilityDistribution): ProbabilityDistribution;
export declare function multiplyIndependent(left: ProbabilityDistribution, right: ProbabilityDistribution): ProbabilityDistribution;
export declare function repeatConvolve(base: ProbabilityDistribution, times: number): ProbabilityDistribution;
export declare function expectation(distribution: ProbabilityDistribution): number;
export declare function probabilityAtLeast(distribution: ProbabilityDistribution, threshold: number): number;
export declare function probabilityAtMost(distribution: ProbabilityDistribution, threshold: number): number;

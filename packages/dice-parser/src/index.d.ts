export type TermSign = 1 | -1;
export interface DiceComponent {
    readonly kind: "dice";
    readonly count: number;
    readonly sides: number;
    readonly sign: TermSign;
}
export interface ConstantComponent {
    readonly kind: "constant";
    readonly value: number;
}
export type ExpressionComponent = DiceComponent | ConstantComponent;
export interface ParsedDiceExpression {
    readonly source: string;
    readonly normalized: string;
    readonly components: readonly ExpressionComponent[];
}
export interface DiceParseIssue {
    readonly message: string;
    readonly index: number;
}
export declare class DiceParseError extends Error {
    readonly issue: DiceParseIssue;
    constructor(issue: DiceParseIssue);
}
export interface DiceParseSuccess {
    readonly ok: true;
    readonly value: ParsedDiceExpression;
}
export interface DiceParseFailure {
    readonly ok: false;
    readonly error: DiceParseError;
}
export type DiceParseResult = DiceParseSuccess | DiceParseFailure;
export declare function formatDiceExpression(expression: ParsedDiceExpression | readonly ExpressionComponent[]): string;
export declare function parseDiceExpression(input: string): ParsedDiceExpression;
export declare function tryParseDiceExpression(input: string): DiceParseResult;
export declare function isDiceExpression(input: string): boolean;

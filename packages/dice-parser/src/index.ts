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

export class DiceParseError extends Error {
  public readonly issue: DiceParseIssue;

  public constructor(issue: DiceParseIssue) {
    super(`${issue.message} (index ${issue.index})`);
    this.name = "DiceParseError";
    this.issue = issue;
  }
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

interface IntegerToken {
  readonly value: number;
  readonly nextIndex: number;
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function skipWhitespace(input: string, startIndex: number): number {
  let index = startIndex;
  while (index < input.length && /\s/u.test(input[index] ?? "")) {
    index += 1;
  }
  return index;
}

function readUnsignedInteger(input: string, startIndex: number): IntegerToken | null {
  if (!isDigit(input[startIndex])) {
    return null;
  }

  let endIndex = startIndex;
  while (isDigit(input[endIndex])) {
    endIndex += 1;
  }

  return {
    value: Number.parseInt(input.slice(startIndex, endIndex), 10),
    nextIndex: endIndex
  };
}

function formatComponent(component: ExpressionComponent): string {
  if (component.kind === "dice") {
    return `${component.count}d${component.sides}`;
  }

  return `${Math.abs(component.value)}`;
}

function makeIssue(message: string, index: number): DiceParseIssue {
  return { message, index };
}

export function formatDiceExpression(expression: ParsedDiceExpression | readonly ExpressionComponent[]): string {
  const components =
    "components" in expression ? expression.components : expression;
  if (components.length === 0) {
    return "0";
  }

  const fragments: string[] = [];
  for (const [index, component] of components.entries()) {
    const isNegative = component.kind === "dice" ? component.sign < 0 : component.value < 0;
    const body = formatComponent(component);

    if (index === 0) {
      fragments.push(isNegative ? `-${body}` : body);
      continue;
    }

    fragments.push(`${isNegative ? "-" : "+"}${body}`);
  }

  return fragments.join("");
}

export function parseDiceExpression(input: string): ParsedDiceExpression {
  const source = input;
  let index = 0;
  let isFirstTerm = true;
  let pendingSign: TermSign = 1;
  const components: ExpressionComponent[] = [];

  while (true) {
    index = skipWhitespace(source, index);

    if (index >= source.length) {
      if (isFirstTerm) {
        throw new DiceParseError(makeIssue("表达式不能为空", 0));
      }

      throw new DiceParseError(makeIssue("表达式不能以操作符结尾", source.length - 1));
    }

    if (isFirstTerm && (source[index] === "+" || source[index] === "-")) {
      pendingSign = source[index] === "-" ? -1 : 1;
      index += 1;
      index = skipWhitespace(source, index);
    }

    const startOfTerm = index;
    const countToken = readUnsignedInteger(source, index);
    let count: number | null = null;

    if (countToken !== null) {
      count = countToken.value;
      index = countToken.nextIndex;
    }

    if (source[index] === "d" || source[index] === "D") {
      index += 1;

      const sidesToken = readUnsignedInteger(source, index);
      if (sidesToken === null) {
        throw new DiceParseError(makeIssue("缺少骰子面数", index));
      }

      const diceCount = count ?? 1;
      const diceSides = sidesToken.value;

      if (diceCount <= 0) {
        throw new DiceParseError(makeIssue("骰子数量必须大于 0", startOfTerm));
      }

      if (diceSides <= 0) {
        throw new DiceParseError(makeIssue("骰子面数必须大于 0", index));
      }

      components.push({
        kind: "dice",
        count: diceCount,
        sides: diceSides,
        sign: pendingSign
      });

      index = sidesToken.nextIndex;
    } else if (count !== null) {
      components.push({
        kind: "constant",
        value: pendingSign * count
      });
    } else {
      throw new DiceParseError(makeIssue("期望骰子项或数字", index));
    }

    pendingSign = 1;
    isFirstTerm = false;
    index = skipWhitespace(source, index);

    if (index >= source.length) {
      break;
    }

    const operator = source[index];
    if (operator !== "+" && operator !== "-" && operator !== ",") {
      throw new DiceParseError(makeIssue(`非法字符 '${operator}'`, index));
    }

    pendingSign = operator === "-" ? -1 : 1;
    index += 1;
    index = skipWhitespace(source, index);

    if (index >= source.length) {
      throw new DiceParseError(makeIssue("表达式不能以操作符结尾", source.length - 1));
    }
  }

  return {
    source,
    normalized: formatDiceExpression(components),
    components
  };
}

export function tryParseDiceExpression(input: string): DiceParseResult {
  try {
    return {
      ok: true,
      value: parseDiceExpression(input)
    };
  } catch (error) {
    if (error instanceof DiceParseError) {
      return {
        ok: false,
        error
      };
    }

    const fallback = new DiceParseError(makeIssue("未知解析错误", 0));
    return {
      ok: false,
      error: fallback
    };
  }
}

export function isDiceExpression(input: string): boolean {
  return tryParseDiceExpression(input).ok;
}

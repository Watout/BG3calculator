import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App, { InlineRepeatControl, LabelWithInfo } from "./App";

function extractMarkupSegment(markup: string, pattern: RegExp): string {
  const match = markup.match(pattern);
  if (match === null) {
    throw new Error(`Expected markup to match ${pattern}`);
  }

  return match[0];
}

describe("App attack entry label layout", (): void => {
  it("renders main-hand repeat control next to the main damage label instead of the entry header", (): void => {
    const markup = renderToStaticMarkup(<App />);
    const headerMarkup = extractMarkupSegment(
      markup,
      /<header class="entry-head">[\s\S]*?<\/header>/,
    );
    const mainHandLabelMarkup = extractMarkupSegment(
      markup,
      /<label><span class="label-with-info">[\s\S]*?aria-label="攻击项 1 主手伤害骰表达式"[\s\S]*?<\/label>/,
    );

    expect(headerMarkup).not.toContain("主手执行");
    expect(mainHandLabelMarkup).toContain("主手伤害骰表达式");
    expect(mainHandLabelMarkup).toContain("主手执行");
    expect(mainHandLabelMarkup).toContain('aria-label="攻击项 1 主手执行次数"');
  });

  it("keeps the off-hand repeat control hidden until the label receives trailing repeat content", (): void => {
    const appMarkup = renderToStaticMarkup(<App />);
    const offHandLabelMarkup = extractMarkupSegment(
      appMarkup,
      /<label><span class="label-with-info">[\s\S]*?aria-label="攻击项 1 副手伤害骰表达式"[\s\S]*?<\/label>/,
    );
    const offHandWithRepeatMarkup = renderToStaticMarkup(
      <LabelWithInfo
        title="副手伤害骰表达式"
        info="测试说明"
        trailing={(
          <InlineRepeatControl
            ariaLabel="攻击项 1 副手执行次数"
            label="副手执行"
            value="19"
            onChange={() => undefined}
          />
        )}
      />,
    );

    expect(offHandLabelMarkup).not.toContain("副手执行");
    expect(offHandLabelMarkup).not.toContain('aria-label="攻击项 1 副手执行次数"');
    expect(offHandWithRepeatMarkup).toContain("副手执行");
    expect(offHandWithRepeatMarkup).toContain('aria-label="攻击项 1 副手执行次数"');
  });

  it("keeps tooltip content nested under the info icon button only", (): void => {
    const markup = renderToStaticMarkup(
      <LabelWithInfo
        title="主手伤害骰表达式"
        info="说明文本"
        trailing={(
          <InlineRepeatControl
            ariaLabel="攻击项 1 主手执行次数"
            label="主手执行"
            value="8"
            onChange={() => undefined}
          />
        )}
      />,
    );
    const [beforeInfoHint] = markup.split('<button type="button" class="info-hint"');

    expect(markup).toContain(
      '<button type="button" class="info-hint" aria-label="说明文本">i<span role="tooltip" class="info-tip">说明文本</span></button>',
    );
    expect(markup).toMatch(
      /class="label-title">主手伤害骰表达式<\/span><span class="label-trailing">[\s\S]*?<\/span><\/span><button type="button" class="info-hint"/,
    );
    expect(beforeInfoHint).not.toContain('class="info-tip"');
  });
});

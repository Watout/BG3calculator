import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App, { InlineRepeatSelect, LabelWithInfo } from "./App";

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
    expect(mainHandLabelMarkup).toMatch(
      /class="label-title">主手伤害骰表达式<\/span><button type="button" class="info-hint"[\s\S]*?<\/button><\/span><span class="label-trailing">[\s\S]*?主手执行[\s\S]*?<select aria-label="攻击项 1 主手执行次数"/,
    );
  });

  it("keeps off-hand repeat and attack bonus controls visible even when off-hand damage is empty", (): void => {
    const appMarkup = renderToStaticMarkup(<App />);
    const offHandLabelMarkup = extractMarkupSegment(
      appMarkup,
      /<label><span class="label-with-info">[\s\S]*?aria-label="攻击项 1 副手伤害骰表达式"[\s\S]*?<\/label>/,
    );

    expect(offHandLabelMarkup).toContain("副手执行");
    expect(offHandLabelMarkup).toContain('aria-label="攻击项 1 副手执行次数"');
    expect(appMarkup).toContain('aria-label="攻击项 1 副手攻击加值表达式"');
  });

  it("renders attack bonus as a single expression input and keeps tooltip nested under the info icon only", (): void => {
    const appMarkup = renderToStaticMarkup(<App />);
    const markup = renderToStaticMarkup(
      <LabelWithInfo
        title="主手伤害骰表达式"
        info="说明文本"
        trailing={(
          <InlineRepeatSelect
            ariaLabel="攻击项 1 主手执行次数"
            label="主手执行"
            value="8"
            onChange={() => undefined}
          />
        )}
      />,
    );
    const [beforeInfoHint] = markup.split('<button type="button" class="info-hint"');

    expect(appMarkup).toContain('aria-label="攻击项 1 主手攻击加值表达式"');
    expect(appMarkup).toContain('aria-label="攻击项 1 副手攻击加值表达式"');
    expect(appMarkup).not.toContain("主手攻击加值固定值");
    expect(appMarkup).not.toContain("副手攻击加值固定值");
    expect(appMarkup).not.toContain(">无</option>");
    expect(markup).toContain(
      '<button type="button" class="info-hint" aria-label="说明文本">i<span role="tooltip" class="info-tip">说明文本</span></button>',
    );
    expect(markup).toMatch(
      /class="label-title">主手伤害骰表达式<\/span><button type="button" class="info-hint"[\s\S]*?<\/button><\/span><span class="label-trailing">/,
    );
    expect(beforeInfoHint).not.toContain('class="info-tip"');
  });
});

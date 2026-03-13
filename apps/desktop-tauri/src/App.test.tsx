// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
});

function getFieldShellByInputLabel(ariaLabel: string): HTMLElement {
  const control = screen.getByLabelText(ariaLabel);
  const shell = control.closest(".field-shell");
  if (!(shell instanceof HTMLElement)) {
    throw new Error(`Expected ${ariaLabel} to live inside .field-shell`);
  }

  return shell;
}

describe("App attack entry controls", (): void => {
  it("shows tooltip only when hovering or focusing the info icon", (): void => {
    render(<App />);

    const mainHandField = getFieldShellByInputLabel("攻击项 1 主手伤害骰表达式");
    const labelRow = mainHandField.querySelector(".label-with-info");
    const title = within(mainHandField).getByText("主手伤害骰表达式");
    const input = within(mainHandField).getByLabelText("攻击项 1 主手伤害骰表达式");
    const infoButton = within(mainHandField).getByRole("button", {
      name: "例如 1d8+3、2d6+1。重击时只翻倍骰子部分，不翻倍常数。",
    });

    if (!(labelRow instanceof HTMLElement)) {
      throw new Error("Expected .label-with-info to exist");
    }

    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.pointerEnter(labelRow);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.pointerEnter(title);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.pointerEnter(input);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.pointerEnter(infoButton);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("例如 1d8+3、2d6+1");

    fireEvent.pointerLeave(infoButton);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(infoButton);
    expect(screen.getByRole("tooltip").textContent).toContain("重击时只翻倍骰子部分");

    fireEvent.blur(infoButton);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("uses the compact repeat dropdown, slides its numeric window, and closes it after selection or dismissal", (): void => {
    render(<App />);

    const trigger = screen.getByRole("button", { name: "攻击项 1 主手执行次数" });

    expect(screen.queryByRole("combobox", { name: "攻击项 1 主手执行次数" })).toBeNull();

    fireEvent.click(trigger);
    let listbox = screen.getByRole("listbox", { name: "攻击项 1 主手执行次数" });
    fireEvent.wheel(listbox, { deltaY: 720 });
    listbox = screen.getByRole("listbox", { name: "攻击项 1 主手执行次数" });
    fireEvent.click(within(listbox).getByRole("option", { name: "25" }));
    expect(screen.queryByRole("listbox", { name: "攻击项 1 主手执行次数" })).toBeNull();
    expect(trigger.textContent).toContain("25");

    fireEvent.click(trigger);
    expect(screen.getByRole("listbox", { name: "攻击项 1 主手执行次数" })).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox", { name: "攻击项 1 主手执行次数" })).toBeNull();

    fireEvent.click(trigger);
    listbox = screen.getByRole("listbox", { name: "攻击项 1 主手执行次数" });
    expect(listbox).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "攻击项 1 主手执行次数" })).toBeNull();
  });

  it("keeps off-hand repeat visible, uses compact dropdowns for template repeat and critical threshold, and removes attack bonus extra dropdowns", (): void => {
    render(<App />);

    const mainHandField = getFieldShellByInputLabel("攻击项 1 主手伤害骰表达式");
    const mainHeading = mainHandField.querySelector(".label-heading");
    const mainTrailing = mainHandField.querySelector(".label-trailing");
    const offHandField = getFieldShellByInputLabel("攻击项 1 副手伤害骰表达式");
    const mainAttackBonusField = getFieldShellByInputLabel("攻击项 1 主手攻击加值表达式");

    if (!(mainHeading instanceof HTMLElement) || !(mainTrailing instanceof HTMLElement)) {
      throw new Error("Expected heading and trailing regions to exist");
    }

    expect(Array.from(mainHeading.children).map((element) => element.className)).toEqual([
      "label-title label-title-link",
      "info-hint",
    ]);
    expect(mainTrailing.textContent).toContain("主手执行");
    expect(screen.getByRole("button", { name: "攻击项 1 副手执行次数" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "模板执行次数" })).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "模板执行次数" })).toBeNull();
    expect(screen.getByRole("button", { name: "攻击项 1 重击阈值" })).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "攻击项 1 重击阈值" })).toBeNull();
    expect(mainAttackBonusField.querySelector(".compact-dropdown")).toBeNull();
    expect(within(offHandField).getByText("副手执行")).not.toBeNull();
  });

  it("slides the template repeat and critical threshold dropdown windows", (): void => {
    render(<App />);

    const planTrigger = screen.getByRole("button", { name: "模板执行次数" });
    fireEvent.click(planTrigger);
    let listbox = screen.getByRole("listbox", { name: "模板执行次数" });
    fireEvent.wheel(listbox, { deltaY: 720 });
    listbox = screen.getByRole("listbox", { name: "模板执行次数" });
    fireEvent.click(within(listbox).getByRole("option", { name: "25" }));
    expect(screen.queryByRole("listbox", { name: "模板执行次数" })).toBeNull();
    expect(planTrigger.textContent).toContain("25");

    const criticalTrigger = screen.getByRole("button", { name: "攻击项 1 重击阈值" });
    fireEvent.click(criticalTrigger);
    listbox = screen.getByRole("listbox", { name: "攻击项 1 重击阈值" });
    expect(within(listbox).getAllByRole("option").slice(0, 4).map((option) => option.textContent)).toEqual([
      "20+",
      "19+",
      "18+",
      "17+",
    ]);
    fireEvent.wheel(listbox, { deltaY: 720 });
    listbox = screen.getByRole("listbox", { name: "攻击项 1 重击阈值" });
    fireEvent.click(within(listbox).getByRole("option", { name: "1+" }));
    expect(screen.queryByRole("listbox", { name: "攻击项 1 重击阈值" })).toBeNull();
    expect(criticalTrigger.textContent).toContain("1+");
  });
});

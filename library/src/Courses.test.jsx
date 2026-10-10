import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Courses } from "./Courses";
import { validateCourse } from "./model";
import { plan } from "./test-fixture";

afterEach(cleanup);

function setup(focus) {
  const base = validateCourse(plan);
  base.readings[0].editions[0].minutes = 250;
  base.sessions[0].groups[0].assignments[0] = {
    ...base.sessions[0].groups[0].assignments[0],
    focus,
    minutes: focus ? 60 : null,
  };
  const course = { ...base, id: "course" },
    onFocus = vi.fn().mockResolvedValue();
  render(
    <Courses
      courses={[course]}
      books={[]}
      route={["courses", "course", "sessions", "day1"]}
      onImport={vi.fn()}
      onUpload={vi.fn()}
      onLink={vi.fn()}
      onPrepare={vi.fn()}
      onFocus={onFocus}
    />,
  );
  return { onFocus, user: userEvent.setup() };
}
describe("reading focus", () => {
  it("shows what to read and uses the narrowed time for the reading and the day", () => {
    setup("Only pp. 117 to 148");
    expect(screen.getByText("Only pp. 117 to 148")).toBeTruthy();
    expect(screen.getByText(/About 1 h of required/)).toBeTruthy();
    expect(screen.getAllByText(/60/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/250/)).toBeNull();
  });
  it("edits the focus by keyboard and saves it to the right assignment", async () => {
    const { onFocus, user } = setup(null);
    await user.click(
      screen.getByRole("button", { name: "Add what to read in Chapter" }),
    );
    const field = screen.getByLabelText("What to read in Chapter");
    await user.type(field, "Intro and conclusion");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onFocus).toHaveBeenCalledWith(
      "course",
      "day1",
      "topic",
      "chapter",
      "Intro and conclusion",
    );
  });
  it("discards an edit on Escape without saving", async () => {
    const { onFocus, user } = setup("Whole chapter");
    await user.click(
      screen.getByRole("button", { name: "Edit what to read in Chapter" }),
    );
    await user.type(
      screen.getByLabelText("What to read in Chapter"),
      " changed{Escape}",
    );
    expect(onFocus).not.toHaveBeenCalled();
    expect(screen.getByText("Whole chapter")).toBeTruthy();
  });
});

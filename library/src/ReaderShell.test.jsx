import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("./reader-engine", () => ({
  mountReaderEngine: vi.fn().mockResolvedValue(),
}));
import ReaderShell from "./ReaderShell";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  delete window.toggleToc;
  delete window.toggleRsvpMode;
});
describe("reader bridge", () => {
  it("mounts the original engine targets and returns to the selected course session", async () => {
    window.history.replaceState(
      null,
      "",
      "/library/reader.html?id=old&course=policy&session=day1",
    );
    window.toggleToc = vi.fn();
    window.toggleRsvpMode = vi.fn();
    render(<ReaderShell />);
    expect(
      screen
        .getByRole("link", { name: "Back to course session" })
        .getAttribute("href"),
    ).toBe("index.html#/courses/policy/sessions/day1");
    for (const id of [
      "viewer",
      "auth-gate",
      "progress-track",
      "rsvp-panel",
      "rsvp-word",
      "rsvp-mini-page",
      "settings-panel",
      "toc-list",
      "font-size-display",
    ])
      expect(document.getElementById(id)).not.toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Table of contents" }));
    await user.click(
      screen.getByRole("button", { name: "Toggle RSVP speed reading" }),
    );
    expect(window.toggleToc).toHaveBeenCalledOnce();
    expect(window.toggleRsvpMode).toHaveBeenCalledOnce();
  });
});

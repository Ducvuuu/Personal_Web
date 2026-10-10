import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "./components";

afterEach(cleanup);
it("reports the Firebase failure code without exposing raw server errors and permits retry", async () => {
  const login = vi
      .fn()
      .mockRejectedValue({
        code: "auth/internal-error",
        message: "private server response",
      }),
    user = userEvent.setup();
  render(<AuthGate onLogin={login} />);
  await user.type(screen.getByLabelText("Email"), "owner@example.com");
  await user.type(screen.getByLabelText("Password"), "test-password");
  await user.click(screen.getByRole("button", { name: "Open the library" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "auth/internal-error",
  );
  expect(screen.getByRole("alert").textContent).not.toContain(
    "private server response",
  );
  expect(
    screen.getByRole("button", { name: "Open the library" }).disabled,
  ).toBe(false);
  expect(screen.getByLabelText("Password").value).toBe("test-password");
});
it("submits the entered credentials and preserves spaces in the password", async () => {
  const login = vi.fn().mockResolvedValue(undefined),
    user = userEvent.setup();
  render(<AuthGate onLogin={login} />);
  await user.type(screen.getByLabelText("Email"), "owner@example.com");
  await user.type(
    screen.getByLabelText("Password"),
    "  password with spaces  ",
  );
  await user.click(screen.getByRole("button", { name: "Open the library" }));
  expect(login).toHaveBeenCalledWith(
    "owner@example.com",
    "  password with spaces  ",
  );
});

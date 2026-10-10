import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LibraryApp } from "./App";

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  cleanup();
  window.location.hash = "";
  delete window.PersonalSite;
});
function authFixture() {
  let observer;
  const listeners = [];
  const auth = {
    currentUser: null,
    onAuthStateChanged: (cb) => {
      observer = cb;
      cb(null);
      return vi.fn();
    },
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
  };
  const sdk = {
    auth,
    db: {
      collection: () => ({
        doc: (uid) => ({
          collection: () => ({
            orderBy: () => ({
              onSnapshot: (success, error) => {
                listeners.push({ uid, success, error });
                return vi.fn();
              },
            }),
          }),
        }),
      }),
    },
    storage: {},
    serverTimestamp: () => 0,
  };
  return {
    sdk,
    listeners,
    login: (uid) => {
      auth.currentUser = uid ? { uid } : null;
      observer(auth.currentUser);
    },
    emit: (listener, records) =>
      listener.success({
        docs: records.map((r) => ({ id: r.id, data: () => r })),
      }),
  };
}
describe("library migration", () => {
  it("retains existing book records and clears them across authentication changes, including late snapshots", async () => {
    const fixture = authFixture();
    render(<LibraryApp services={fixture.sdk} />);
    expect(
      screen.getByRole("button", { name: "Open the library" }),
    ).toBeTruthy();
    await act(async () => fixture.login("alice"));
    const old = fixture.listeners[0];
    await act(async () =>
      fixture.emit(old, [
        {
          id: "existing",
          title: "Alice book",
          category: "fiction",
          status: "unread",
          fileUrl: "https://example.com/book.epub",
        },
      ]),
    );
    expect(
      screen.getByRole("button", { name: "Open Alice book" }),
    ).toBeTruthy();
    await act(async () => fixture.login(null));
    expect(screen.queryByText("Alice book")).toBeNull();
    await act(async () => fixture.login("bob"));
    await act(async () =>
      fixture.emit(old, [{ id: "existing", title: "Alice book" }]),
    );
    await act(async () => fixture.emit(fixture.listeners[1], []));
    expect(screen.queryByText("Alice book")).toBeNull();
    expect(screen.getByText("Your shelves are empty.")).toBeTruthy();
  });
  it("shows a real empty course shelf instead of mock courses", async () => {
    const fixture = authFixture(),
      user = userEvent.setup();
    render(<LibraryApp services={fixture.sdk} />);
    await act(async () => fixture.login("owner"));
    await act(async () => fixture.emit(fixture.listeners[0], []));
    await user.click(screen.getByRole("tab", { name: /Courses/ }));
    expect(await screen.findByText("Your course shelf is ready")).toBeTruthy();
    expect(screen.queryByText("Introduction to Public Policy")).toBeNull();
  });
  it("cancels deletion without touching Firebase", async () => {
    const fixture = authFixture(),
      user = userEvent.setup();
    render(<LibraryApp services={fixture.sdk} />);
    await act(async () => fixture.login("owner"));
    await act(async () =>
      fixture.emit(fixture.listeners[0], [
        { id: "book", title: "Keep me", category: "fiction" },
      ]),
    );
    await user.click(screen.getByRole("button", { name: "Delete Keep me" }));
    expect(screen.getByRole("dialog", { name: "Delete book?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Open Keep me" })).toBeTruthy();
  });
});

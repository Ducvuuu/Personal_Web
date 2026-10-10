import { describe, it, expect, vi } from "vitest";
import { createLibraryRepository } from "./repository";
import { validateCourse } from "./model";
import { plan } from "./test-fixture";

function services() {
  const documents = new Map(),
    deleted = [],
    updates = [],
    records = new Map();
  const doc = (id) => {
    id ||= "new-doc";
    if (!documents.has(id))
      documents.set(id, {
        id,
        set: vi.fn().mockResolvedValue(),
        update: vi.fn().mockResolvedValue(),
        delete: vi.fn().mockResolvedValue(),
      });
    return documents.get(id);
  };
  const library = {
    doc,
    orderBy: vi.fn(() => ({ onSnapshot: vi.fn(() => vi.fn()) })),
  };
  const auth = {
    currentUser: { uid: "owner" },
    onAuthStateChanged: vi.fn((cb) => {
      queueMicrotask(() => cb(auth.currentUser));
      return vi.fn();
    }),
  };
  const batch = {
    update: vi.fn((ref, data) => updates.push({ id: ref.id, data })),
    commit: vi.fn().mockResolvedValue(),
  };
  const transaction = {
    get: async (ref) => ({
      exists: records.has(ref.id),
      data: () => records.get(ref.id),
    }),
    update: batch.update,
  };
  const sdk = {
    auth,
    serverTimestamp: () => "server-time",
    db: {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ collection: vi.fn(() => library) })),
      })),
      runTransaction: vi.fn(async (cb) => cb(transaction)),
    },
    storage: {
      ref: (path) => ({
        put: () => ({
          on: (_event, progress, _reject, done) => {
            progress({ bytesTransferred: 1, totalBytes: 1 });
            queueMicrotask(done);
          },
          cancel: vi.fn(),
        }),
        getDownloadURL: async () => `https://files.example/${path}`,
        delete: async () => deleted.push(path),
      }),
    },
  };
  return { sdk, documents, deleted, updates, doc, records };
}
describe("existing Firebase records", () => {
  it("keeps preparation flags separate from EPUB bookmarks, highlights, and percentage", async () => {
    const fixture = services(),
      repo = createLibraryRepository(fixture.sdk, "owner");
    await repo.markPrepared("existing", true);
    expect(fixture.doc("existing").update).toHaveBeenCalledWith({
      preparationComplete: true,
    });
    expect(fixture.sdk.db.collection).toHaveBeenCalledWith("users");
  });
  it("links the existing EPUB atomically without replacing its reading data", async () => {
    const fixture = services(),
      repo = createLibraryRepository(fixture.sdk, "owner"),
      course = { ...validateCourse(plan), id: "course" };
    course.readings[0].editions[0].bookId = null;
    fixture.records.set("course", course);
    fixture.records.set("legacy", {
      fileUrl: "https://files.example/book.epub",
    });
    await repo.linkEdition(course, "chapter", "EN", {
      id: "legacy",
      fileUrl: "https://files.example/book.epub",
    });
    expect(fixture.sdk.db.runTransaction).toHaveBeenCalledOnce();
    expect(
      fixture.updates.find((u) => u.id === "course").data.readings[0]
        .editions[0].bookId,
    ).toBe("legacy");
    expect(fixture.updates.find((u) => u.id === "legacy").data).toEqual({
      courseId: "course",
      readingId: "chapter",
      language: "EN",
      originalPdfUrl: null,
    });
  });
  it("preserves other attachments and rejects conflicts saved by another device", async () => {
    const fixture = services(),
      repo = createLibraryRepository(fixture.sdk, "owner"),
      stale = { ...validateCourse(plan), id: "course" };
    stale.readings[0].editions[0].bookId = null;
    const current = structuredClone(stale);
    current.readings[0].editions[1].bookId = "other-device";
    fixture.records.set("course", current);
    fixture.records.set("legacy", {
      fileUrl: "https://files.example/book.epub",
    });
    await repo.linkEdition(stale, "chapter", "EN", { id: "legacy" });
    expect(fixture.updates[0].data.readings[0].editions[1].bookId).toBe(
      "other-device",
    );
    current.readings[0].editions[0].bookId = "conflicting-attachment";
    fixture.updates.length = 0;
    await expect(
      repo.linkEdition(stale, "chapter", "EN", { id: "legacy" }),
    ).rejects.toThrow(/already has/);
    expect(fixture.updates).toEqual([]);
  });
  it("saves one assignment's focus without dropping attachments made on another device", async () => {
    const fixture = services(),
      repo = createLibraryRepository(fixture.sdk, "owner"),
      current = { ...validateCourse(plan), id: "course" };
    current.readings[0].editions[1].bookId = "other-device";
    fixture.records.set("course", current);
    await repo.setFocus("course", "day2", "topic", "chapter", "  pp. 1 to 9  ");
    const saved = fixture.updates.find((u) => u.id === "course").data;
    expect(Object.keys(saved)).toEqual(["sessions"]);
    expect(saved.sessions[1].groups[0].assignments[0].focus).toBe("pp. 1 to 9");
    expect(saved.sessions[0].groups[0].assignments[0].focus).toBeNull();
    fixture.updates.length = 0;
    await expect(
      repo.setFocus("course", "day2", "topic", "extra", "x"),
    ).rejects.toThrow(/no longer in this session/);
    expect(fixture.updates).toEqual([]);
  });
  it("cleans up uploads when the document write fails", async () => {
    const fixture = services(),
      repo = createLibraryRepository(fixture.sdk, "owner");
    fixture
      .doc("new-doc")
      .set.mockRejectedValue(new Error("Permission denied"));
    await expect(
      repo.uploadBook(
        new File(["epub"], "book.epub"),
        { title: "Book", author: "Author", category: "fiction" },
        vi.fn(),
      ),
    ).rejects.toThrow("Permission denied");
    expect(fixture.deleted).toEqual(["library/owner/books/new-doc.epub"]);
  });
  it("rejects stale writes after sign-out and prevents deleting an attached EPUB", async () => {
    const fixture = services(),
      repo = createLibraryRepository(fixture.sdk, "owner");
    await expect(
      repo.deleteBook({ id: "en" }, [validateCourse(plan)]),
    ).rejects.toThrow(/used by a course/);
    expect(fixture.deleted).toEqual([]);
    fixture.sdk.auth.currentUser = null;
    await expect(repo.markPrepared("en", true)).rejects.toThrow(/locked/);
    expect(fixture.doc("en").update).not.toHaveBeenCalled();
  });
});

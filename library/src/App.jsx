import React, { useEffect, useRef, useState } from "react";
import { getFirebase } from "./firebase";
import { createLibraryRepository } from "./repository";
import { isCourseEdition, readerHref, safeUrl } from "./model";
import {
  AuthGate,
  Bookshelf,
  CurrentlyReading,
  Dialog,
  Icon,
  Progress,
  BookDetails,
} from "./components";
import { Courses, CourseImport, EditionLink, useRoute } from "./Courses";

const emptyLibrary = { books: [], courses: [] };
export function LibraryApp({ services }) {
  const [firebase] = useState(() => services || getFirebase()),
    [user, setUser] = useState(null),
    [authReady, setAuthReady] = useState(false),
    [data, setData] = useState(emptyLibrary),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [modal, setModal] = useState(null),
    [upload, setUpload] = useState(null),
    [notice, setNotice] = useState(""),
    [dragging, setDragging] = useState(false);
  const route = useRoute(),
    courseView = route[0] === "courses";
  const repository = useRef(null),
    fileInput = useRef(null),
    attachment = useRef(null),
    busyUpload = useRef(false),
    shell = useRef(null),
    noticeTimer = useRef(null),
    sessionVersion = useRef(0),
    detailResolve = useRef(null),
    librarySubscription = useRef(null);
  function notify(message) {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(""), 5000);
  }
  useEffect(() => {
    const unsubscribe = firebase.auth.onAuthStateChanged((nextUser) => {
      const version = ++sessionVersion.current;
      librarySubscription.current?.();
      librarySubscription.current = null;
      detailResolve.current?.(null);
      detailResolve.current = null;
      repository.current = null;
      setData(emptyLibrary);
      setModal(null);
      setUpload(null);
      setError("");
      setUser(nextUser);
      setAuthReady(true);
      setLoading(!!nextUser);
      setNotice("");
      if (nextUser) {
        const repo = createLibraryRepository(firebase, nextUser.uid);
        repository.current = repo;
        librarySubscription.current = repo.subscribe(
          (records) => {
            if (sessionVersion.current === version) {
              setData(records);
              setLoading(false);
            }
          },
          (err) => {
            if (sessionVersion.current === version) {
              setError(err.message || "Your library could not load.");
              setLoading(false);
            }
          },
        );
      }
    });
    return () => {
      unsubscribe();
      librarySubscription.current?.();
      detailResolve.current?.(null);
      clearTimeout(noticeTimer.current);
    };
  }, [firebase]);
  useEffect(() => {
    if (user) window.PersonalSite?.mount(shell.current, true);
  }, [user]);
  const openBook = (book) => {
    window.location.href = readerHref(book.id);
  };
  function chooseUpload(context = null) {
    if (busyUpload.current) return;
    attachment.current = context;
    fileInput.current.value = "";
    fileInput.current.click();
  }
  async function handleFile(file, context = null) {
    if (!file || busyUpload.current) return;
    if (!file.name.toLowerCase().endsWith(".epub")) {
      notify(
        "Choose an EPUB file. Original PDFs can be linked in your course reading plan.",
      );
      return;
    }
    if (!repository.current) {
      notify("Sign in to upload a book.");
      return;
    }
    const repo = repository.current,
      version = sessionVersion.current;
    busyUpload.current = true;
    let book, timer;
    setUpload({ title: "Reading metadata…", pct: 5 });
    try {
      let title = context?.reading.title || file.name.replace(/\.epub$/i, ""),
        author = context?.reading.author || "Unknown Author";
      try {
        book = window.ePub(await file.arrayBuffer(), { openAs: "epub" });
        const metadata = await Promise.race([
          book.loaded.metadata,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Metadata timed out")),
              8000,
            );
          }),
        ]);
        if (!context) {
          title = metadata.title || title;
          author = metadata.creator || author;
        }
      } catch {
      } finally {
        clearTimeout(timer);
        book?.destroy();
      }
      if (sessionVersion.current !== version) return;
      setUpload(null);
      const details = await new Promise((resolve) => {
        detailResolve.current = resolve;
        setModal({
          kind: "details",
          defaults: {
            title,
            author,
            category: context ? "non-fiction" : "fiction",
          },
        });
      });
      detailResolve.current = null;
      if (!details || sessionVersion.current !== version) return;
      setModal(null);
      setUpload({ title: "Uploading book…", pct: 10 });
      const result = await repo.uploadBook(file, details, (pct, title) => {
        if (sessionVersion.current === version) setUpload({ title, pct });
      });
      if (sessionVersion.current !== version) return;
      if (context) {
        try {
          await repo.linkEdition(
            context.course,
            context.reading.id,
            context.edition.language,
            { ...details, ...result },
          );
        } catch (err) {
          notify(
            `EPUB uploaded, but it could not be attached: ${err.message} Use Attach EPUB to try again.`,
          );
          return;
        }
      }
      notify(
        context
          ? "Reading uploaded and attached to your course."
          : "Book added to your library.",
      );
    } catch (err) {
      if (sessionVersion.current === version)
        notify(err.message || "Upload failed. Please try again.");
    } finally {
      if (sessionVersion.current === version) {
        setUpload(null);
        setModal(null);
      }
      busyUpload.current = false;
    }
  }
  useEffect(() => {
    if (!user) return;
    let depth = 0;
    const enter = (e) => {
      if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
      e.preventDefault();
      depth++;
      if (!busyUpload.current) setDragging(true);
    };
    const leave = (e) => {
      e.preventDefault();
      if (--depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    };
    const over = (e) => {
      if (Array.from(e.dataTransfer?.types || []).includes("Files"))
        e.preventDefault();
    };
    const drop = (e) => {
      if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      attachment.current = null;
      handleFile(e.dataTransfer.files[0]);
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragleave", leave);
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
    };
  }, [user]);
  async function importCourse(plan) {
    const id = await repository.current.createCourse(plan);
    setModal(null);
    window.location.hash = `/courses/${id}`;
    notify("Course added. Attach your readings to get started.");
  }
  async function link(context, book) {
    await repository.current.linkEdition(
      context.course,
      context.reading.id,
      context.edition.language,
      book,
    );
    setModal(null);
    notify(
      "EPUB attached. Its existing bookmarks and highlights are preserved.",
    );
  }
  const visibleBooks = data.books.filter((book) => !isCourseEdition(book));
  const current = visibleBooks
    .filter((b) => b.status === "reading")
    .sort((a, b) => (b.lastRead?.seconds || 0) - (a.lastRead?.seconds || 0))[0];
  return (
    <>
      {!authReady ? (
        <div className="text-warm-500 p-10" role="status">
          Opening your library…
        </div>
      ) : !user ? (
        <AuthGate
          onLogin={(email, password) =>
            firebase.auth.signInWithEmailAndPassword(email, password)
          }
        />
      ) : (
        <>
          <button
            onClick={() =>
              firebase.auth.signOut().catch((err) => notify(err.message))
            }
            aria-label="Lock library"
            className="fixed bottom-6 right-6 z-40 bg-warm-900/80 backdrop-blur text-warm-400 hover:text-warm-50 w-10 h-10 rounded-full shadow-lg flex items-center justify-center"
          >
            <Icon name="lock" />
          </button>
          <main
            ref={shell}
            id="main-library"
            className="w-full max-w-7xl bg-warm-50 rounded-[2rem] shadow-2xl shadow-warm-900/10 overflow-hidden relative border border-warm-200"
          >
            <div id="site-nav" />
            <div className="relative w-full overflow-hidden">
              <video
                autoPlay
                loop
                muted
                playsInline
                poster="assets/cover.webp"
                className="w-full h-auto block"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.parentElement.classList.add(
                    "library-cover-fallback",
                  );
                }}
              >
                <source src="assets/cover.mp4" type="video/mp4" />
              </video>
              <div
                className="absolute inset-x-0 bottom-0 h-40"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent, #fffbf7)",
                }}
              />
            </div>
            <div
              id="library-content"
              className="px-6 py-12 md:px-16 lg:px-20 relative z-10 min-h-[600px]"
            >
              <header className="mb-10">
                <h1 className="font-heavy text-4xl md:text-6xl text-warm-900 mb-2">
                  The Library
                </h1>
                <span className="font-handwriting text-2xl md:text-3xl text-warm-500 inline-block -rotate-2">
                  Everything in one place, perfectly synced.
                </span>
              </header>
              <div
                className="library-tabs"
                role="tablist"
                aria-label="Library shelves"
              >
                <button
                  role="tab"
                  aria-selected={!courseView}
                  className={!courseView ? "active" : ""}
                  onClick={() => {
                    window.location.hash = "/books";
                  }}
                >
                  <Icon name="book-open" />
                  Books<span>{visibleBooks.length}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={courseView}
                  className={courseView ? "active" : ""}
                  onClick={() => {
                    window.location.hash = "/courses";
                  }}
                >
                  <Icon name="graduation-cap" />
                  Courses<span>{data.courses.length}</span>
                </button>
              </div>
              {error && (
                <p
                  role="alert"
                  className="bg-red-50 text-red-700 p-4 rounded-xl text-sm mb-6"
                >
                  {error}
                </p>
              )}
              {loading ? (
                <p role="status" className="text-warm-500 py-12">
                  Loading your collection…
                </p>
              ) : courseView ? (
                <Courses
                  key={route[1] || "shelf"}
                  courses={data.courses}
                  books={data.books}
                  route={route}
                  onImport={() => setModal({ kind: "course" })}
                  onUpload={chooseUpload}
                  onLink={(context) => setModal({ kind: "link", context })}
                  onPrepare={(id, complete) =>
                    repository.current.markPrepared(id, complete)
                  }
                />
              ) : (
                <>
                  <CurrentlyReading book={current} onOpen={openBook} />
                  <Bookshelf
                    books={visibleBooks.map((b) => ({
                      ...b,
                      coverUrl: safeUrl(b.coverUrl),
                    }))}
                    onOpen={openBook}
                    onDelete={(book) => setModal({ kind: "delete", book })}
                    onUpload={() => chooseUpload()}
                  />
                </>
              )}
            </div>
            <div id="site-footer" />
            {dragging && (
              <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center bg-warm-50/95 backdrop-blur-sm">
                <Icon
                  name="file-arrow-up"
                  className="fa-solid fa-file-arrow-up text-4xl text-warm-400 mb-4"
                />
                <p className="font-heavy text-2xl text-warm-700">
                  Drop your .epub here
                </p>
              </div>
            )}
          </main>
          <input
            ref={fileInput}
            type="file"
            accept=".epub"
            aria-label="Choose EPUB file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files[0],
                context = attachment.current;
              e.target.value = "";
              handleFile(file, context);
            }}
          />
        </>
      )}
      {user && modal?.kind === "details" && (
        <BookDetails
          defaults={modal.defaults}
          onCancel={() => {
            detailResolve.current?.(null);
            setModal(null);
          }}
          onSubmit={(details) => detailResolve.current?.(details)}
        />
      )}{" "}
      {user && modal?.kind === "course" && (
        <CourseImport onClose={() => setModal(null)} onImport={importCourse} />
      )}{" "}
      {user && modal?.kind === "link" && (
        <EditionLink
          context={modal.context}
          books={data.books}
          onClose={() => setModal(null)}
          onLink={link}
        />
      )}{" "}
      {user && modal?.kind === "delete" && (
        <DeleteDialog
          book={modal.book}
          onClose={() => setModal(null)}
          onDelete={async () => {
            await repository.current.deleteBook(modal.book, data.courses);
            setModal(null);
            notify("Book removed.");
          }}
        />
      )}
      {user && upload && (
        <Dialog title={upload.title} busy>
          <div className="text-center mb-6">
            <Icon
              name="circle-notch"
              className="fa-solid fa-circle-notch spin-slow text-2xl text-warm-400"
            />
          </div>
          <Progress value={upload.pct} label="Upload progress" />
          <p className="text-xs text-warm-500 text-center mt-3">
            {upload.pct}%
          </p>
        </Dialog>
      )}
      <div role="status" aria-live="polite">
        {notice && <div className="library-toast">{notice}</div>}
      </div>
    </>
  );
}
function DeleteDialog({ book, onClose, onDelete }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Delete book?" onClose={onClose} busy={busy}>
      <p className="text-sm text-warm-500 mb-6">
        Remove “{book.title}” and its uploaded files from your library? This
        cannot be undone.
      </p>
      {error && (
        <p role="alert" className="text-red-600 text-sm mb-5">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button className="library-soft" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="library-primary bg-red-600"
          disabled={busy}
          onClick={remove}
        >
          {busy ? "Deleting…" : "Delete book"}
        </button>
      </div>
    </Dialog>
  );
}

import React, { useEffect, useRef } from "react";
import { signInErrorMessage } from "./auth-errors";

export const Icon = ({ name, ...props }) => (
  <i className={`fa-solid fa-${name}`} aria-hidden="true" {...props} />
);
export function Progress({ value = 0, label = "Reading progress" }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className="progress-bar-container"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
export function Dialog({ title, children, onClose, busy = false }) {
  const ref = useRef(null),
    closeRef = useRef(onClose),
    busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const before = document.activeElement,
      node = ref.current,
      overflow = document.body.style.overflow;
    const focusable = () => [
      ...node.querySelectorAll(
        "button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],textarea",
      ),
    ];
    focusable()[0]?.focus();
    document.body.style.overflow = "hidden";
    const key = (e) => {
      if (e.key === "Escape" && !busyRef.current) closeRef.current?.();
      if (e.key === "Tab") {
        const list = focusable(),
          first = list[0],
          last = list.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !node.contains(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-dialog-title"
        className="bg-warm-50 rounded-[2rem] border border-warm-200 shadow-2xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <h2 id="library-dialog-title" className="font-heavy text-xl mb-5">
          {title}
        </h2>
        {children}
      </section>
    </div>
  );
}
export function AuthGate({ onLogin }) {
  const [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await onLogin(
        String(form.get("email")).trim(),
        String(form.get("password")),
      );
    } catch (err) {
      setError(signInErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      id="auth-gate"
      className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/70 backdrop-blur-md p-4"
    >
      <form
        onSubmit={submit}
        className="bg-warm-50 rounded-[2rem] border border-warm-200 shadow-2xl shadow-warm-900/20 p-10 w-full max-w-sm relative"
      >
        <div
          className="absolute top-0 left-1/2 w-24 h-7 bg-white/50 backdrop-blur-sm border border-white/20 rounded"
          style={{ transform: "translateX(-50%) rotate(-1.5deg)" }}
        />
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-warm-100 border border-warm-200 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Icon
              name="book-open"
              className="fa-solid fa-book-open text-warm-400 text-xl"
            />
          </div>
          <h1 className="font-heavy text-2xl text-warm-900 mb-1">
            The Library
          </h1>
          <p className="font-mono text-xs text-warm-400 uppercase tracking-widest">
            Private collection · authorised only
          </p>
        </div>
        <div className="space-y-4">
          <label className="block font-mono text-[10px] text-warm-500 uppercase tracking-widest">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              className="library-input mt-1.5"
              placeholder="your@email.com"
            />
          </label>
          <label className="block font-mono text-[10px] text-warm-500 uppercase tracking-widest">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="library-input mt-1.5"
              placeholder="••••••••"
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          <button disabled={busy} className="library-primary w-full">
            <Icon name={busy ? "circle-notch" : "lock"} />
            {busy ? "Unlocking…" : "Open the library"}
          </button>
        </div>
      </form>
    </div>
  );
}
export function BookCover({ book }) {
  return (
    <div className="book-cover aspect-[2/3] bg-warm-800 relative">
      {book.coverUrl ? (
        <img
          src={book.coverUrl}
          alt={`Cover of ${book.title}`}
          className="book-cover-image"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 p-4 flex items-center justify-center bg-warm-700">
          <span className="font-heavy text-white text-sm text-center leading-tight">
            {book.title}
          </span>
        </div>
      )}
    </div>
  );
}
export function CurrentlyReading({ book, onOpen }) {
  if (!book) return null;
  return (
    <section id="currently-reading-section" className="mb-16">
      <div className="bg-[#fffdfa] rounded-[2rem] border border-warm-200 p-6 md:p-10 shadow-[0_15px_35px_-5px_rgba(74,37,23,0.1)] relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-orange-50 rounded-full blur-3xl opacity-40 pointer-events-none" />
        <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center relative z-10">
          <button
            className="w-40 sm:w-48 shrink-0 book-card"
            onClick={() => onOpen(book)}
            aria-label={`Continue reading ${book.title}`}
          >
            <BookCover book={book} />
          </button>
          <div className="flex-1 w-full">
            <div className="inline-flex items-center gap-2 font-mono text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-4">
              <Icon name="bookmark" /> Currently Reading
            </div>
            <h2 className="font-heavy text-3xl md:text-4xl text-warm-900 mb-2 leading-tight">
              {book.title}
            </h2>
            <p className="text-lg text-warm-500 mb-6 font-light">
              {book.author || "Unknown Author"}
            </p>
            <div className="bg-warm-50 border border-warm-200 p-4 rounded-xl shadow-inner mb-6">
              <div className="flex justify-between font-mono text-xs text-warm-800 font-bold mb-2">
                <span>{book.currentChapter || "Reading…"}</span>
                <span className="text-orange-600">{book.percentage || 0}%</span>
              </div>
              <Progress value={book.percentage} />
            </div>
            <button className="library-primary" onClick={() => onOpen(book)}>
              <Icon name="book-open" />
              Continue Reading
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
export function Bookshelf({ books, onOpen, onDelete, onUpload }) {
  const [filter, setFilter] = React.useState("all");
  const filtered = books.filter(
    (b) => filter === "all" || b.category === filter,
  );
  return (
    <>
      <div className="flex flex-wrap justify-between items-end mb-6 gap-3">
        <h2 className="font-heavy text-2xl text-warm-900">The Bookshelf</h2>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter books by category"
        >
          {["all", "fiction", "non-fiction", "essays", "manuscripts"].map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`px-3 py-1 rounded-lg text-xs font-bold font-mono ${filter === f ? "bg-warm-200 text-warm-900" : "hover:bg-warm-100 text-warm-600"}`}
              >
                {f === "all"
                  ? "All"
                  : f === "non-fiction"
                    ? "Non-Fiction"
                    : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ),
          )}
        </div>
      </div>
      {!books.length && (
        <div className="text-center py-12">
          <p className="font-mono text-sm text-warm-400 mb-2">
            Your shelves are empty.
          </p>
          <p className="font-mono text-xs text-warm-400">
            Drop an .epub anywhere on this page to begin.
          </p>
        </div>
      )}
      {books.length > 0 && !filtered.length && (
        <p className="text-warm-500 text-sm mb-6">
          No books in this category yet.
        </p>
      )}
      <div
        id="book-grid"
        className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-10 pb-12"
      >
        {filtered.map((book) => (
          <article key={book.id} className="group relative">
            <button
              className="w-full text-left"
              onClick={() => onOpen(book)}
              aria-label={`Open ${book.title}`}
            >
              <div className="book-card mb-3">
                <BookCover book={book} />
              </div>
              <h3 className="font-bold text-warm-900 text-sm leading-tight mb-0.5 group-hover:text-orange-600 line-clamp-2">
                {book.title}
              </h3>
              <p className="text-xs text-warm-500 mb-1">
                {book.author || "Unknown"}
              </p>
              {book.status === "finished" ? (
                <span className="text-[10px] text-green-700">
                  <Icon name="check" /> Finished
                </span>
              ) : book.percentage > 0 ? (
                <Progress value={book.percentage} />
              ) : (
                <span className="font-mono text-[9px] text-warm-400">
                  Unread
                </span>
              )}
            </button>
            <button
              onClick={() => onDelete(book)}
              className="absolute top-2 right-2 w-7 h-7 bg-white/90 text-red-500 rounded-full flex items-center justify-center opacity-100 md:opacity-0 group-hover:opacity-100 focus:opacity-100 shadow-sm z-10"
              aria-label={`Delete ${book.title}`}
            >
              <Icon name="trash-can" />
            </button>
          </article>
        ))}
        <button
          onClick={onUpload}
          aria-label="Add a book"
          className="group self-start"
        >
          <div className="w-full aspect-[2/3] rounded-lg border-2 border-dashed border-warm-300 bg-warm-50/50 hover:bg-warm-100 flex flex-col items-center justify-center transition-colors mb-3">
            <Icon
              name="plus"
              className="fa-solid fa-plus text-2xl text-warm-300 mb-2"
            />
            <span className="font-mono text-[10px] font-bold text-warm-400 uppercase tracking-widest">
              Drop .epub
            </span>
          </div>
        </button>
      </div>
    </>
  );
}
export function BookDetails({ defaults, onCancel, onSubmit }) {
  const [error, setError] = React.useState("");
  function submit(e) {
    e.preventDefault();
    const values = new FormData(e.currentTarget),
      cover = values.get("cover");
    if (cover?.size > 2 * 1024 * 1024) {
      setError("Choose a cover image smaller than 2 MB.");
      return;
    }
    if (cover?.size && !cover.type.startsWith("image/")) {
      setError("Choose an image for the cover.");
      return;
    }
    onSubmit({
      title: String(values.get("title")).trim(),
      author: String(values.get("author")).trim(),
      category: values.get("category"),
      coverFile: cover?.size ? cover : null,
    });
  }
  return (
    <Dialog title="Book details" onClose={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <label className="library-label">
          Title
          <input
            name="title"
            className="library-input"
            defaultValue={defaults.title}
            maxLength={300}
            required
          />
        </label>
        <label className="library-label">
          Author
          <input
            name="author"
            className="library-input"
            defaultValue={defaults.author}
            maxLength={300}
          />
        </label>
        <label className="library-label">
          Category
          <select
            name="category"
            className="library-input"
            defaultValue={defaults.category || "fiction"}
          >
            {["fiction", "non-fiction", "essays", "manuscripts"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="library-label">
          Cover image (optional, max 2 MB)
          <input
            name="cover"
            type="file"
            accept="image/*"
            className="text-xs mt-2"
          />
        </label>
        {error && (
          <p role="alert" className="text-red-600 text-xs">
            {error}
          </p>
        )}
        <div className="flex gap-3 justify-end">
          <button type="button" className="library-soft" onClick={onCancel}>
            Cancel
          </button>
          <button className="library-primary">Add to library</button>
        </div>
      </form>
    </Dialog>
  );
}

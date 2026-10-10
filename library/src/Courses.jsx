import React, { useState } from "react";
import { Icon, Progress, Dialog } from "./components";
import {
  courseStats,
  sessionStats,
  readingComplete,
  editionBook,
  editionComplete,
  nextSession,
  readerHref,
  safeUrl,
  validateCourse,
} from "./model";

const go = (path) => {
  window.location.hash = path;
};
const dateText = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
export function useRoute() {
  const read = () => window.location.hash.slice(1).split("/").filter(Boolean);
  const [route, setRoute] = useState(read);
  React.useEffect(() => {
    const handler = () => {
      setRoute(read());
      document
        .getElementById("library-content")
        ?.scrollIntoView?.({ block: "start" });
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return route;
}
function Crumbs({ course, session }) {
  return (
    <nav className="course-crumbs" aria-label="Breadcrumb">
      <button onClick={() => go("/courses")}>Courses</button>
      <Icon name="chevron-right" />
      {session ? (
        <>
          <button onClick={() => go(`/courses/${course.id}`)}>
            {course.code || course.title}
          </button>
          <Icon name="chevron-right" />
          <span aria-current="page">{dateText(session.date)}</span>
        </>
      ) : (
        <span aria-current="page">{course.code || course.title}</span>
      )}
    </nav>
  );
}
export function Courses({
  courses,
  books,
  route,
  onImport,
  onUpload,
  onLink,
  onPrepare,
}) {
  const [search, setSearch] = useState(""),
    [tab, setTab] = useState("sessions");
  const course = courses.find((c) => c.id === route[1]);
  const session = course?.sessions.find((s) => s.id === route[3]);
  if (route[1] && !course)
    return (
      <div className="course-empty">
        <h2>Course not found</h2>
        <button className="library-soft" onClick={() => go("/courses")}>
          Back to courses
        </button>
      </div>
    );
  if (course && route[2] === "sessions" && !session)
    return (
      <div className="course-empty">
        <h2>Session not found</h2>
        <button
          className="library-soft"
          onClick={() => go(`/courses/${course.id}`)}
        >
          Back to course
        </button>
      </div>
    );
  if (session)
    return (
      <Session
        key={session.id}
        course={course}
        session={session}
        books={books}
        onUpload={onUpload}
        onLink={onLink}
        onPrepare={onPrepare}
      />
    );
  if (course) {
    const stats = courseStats(course, books),
      next = nextSession(course);
    return (
      <div className="course-ui">
        <Crumbs course={course} />
        <header className="course-heading">
          <div>
            <p className="font-mono text-xs text-warm-500">
              {course.code} · {course.term}
            </p>
            <h2 className="font-heavy text-3xl md:text-4xl my-3">
              {course.title}
            </h2>
            <p className="text-sm text-warm-500">{course.description}</p>
          </div>
          <div className="course-emblem">
            <Icon name="building-columns" />
          </div>
        </header>
        <p className="text-xs text-warm-500 mb-4">
          {course.sessions.length} sessions · {stats.done} of {stats.total}{" "}
          required readings complete
        </p>
        <Progress value={stats.percent} label="Course preparation progress" />
        <div
          className="course-subtabs"
          role="tablist"
          aria-label="Course views"
        >
          <button
            role="tab"
            aria-selected={tab === "sessions"}
            onClick={() => setTab("sessions")}
            className={tab === "sessions" ? "active" : ""}
          >
            Class sessions
          </button>
          <button
            role="tab"
            aria-selected={tab === "readings"}
            onClick={() => setTab("readings")}
            className={tab === "readings" ? "active" : ""}
          >
            All readings
          </button>
        </div>
        {tab === "sessions" ? (
          <div className="course-sessions">
            {[...course.sessions]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((s) => {
                const st = sessionStats(course, s, books),
                  date = new Date(s.date + "T12:00:00");
                return (
                  <button
                    className={`course-session ${next?.id === s.id ? "upcoming" : ""}`}
                    key={s.id}
                    onClick={() => go(`/courses/${course.id}/sessions/${s.id}`)}
                  >
                    <div className="course-date">
                      <strong>{date.getDate()}</strong>
                      <span>
                        {date.toLocaleDateString("en", { month: "short" })}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-warm-500">
                        {s.format}
                        {next?.id === s.id && (
                          <span className="course-tag ml-2">Next class</span>
                        )}
                      </p>
                      <h3 className="font-bold text-base mt-1">{s.title}</h3>
                      <p className="text-xs text-warm-500 mt-1">
                        {s.groups.length} topics · {st.total} required readings
                      </p>
                    </div>
                    <div className="course-session-progress">
                      <p className="text-xs text-warm-500 mb-2">
                        {st.done === st.total && st.total
                          ? "Prepared"
                          : `${st.done} / ${st.total} completed`}
                      </p>
                      <Progress
                        value={st.percent}
                        label={`${s.title} preparation`}
                      />
                    </div>
                    <Icon name="chevron-right" />
                  </button>
                );
              })}
          </div>
        ) : (
          <div className="space-y-3">
            {course.readings.map((reading) => (
              <ReadingRow
                key={reading.id}
                reading={reading}
                assignment={{
                  required: course.sessions.some((s) =>
                    s.groups.some((g) =>
                      g.assignments.some(
                        (a) =>
                          a.readingId === reading.id && a.required !== false,
                      ),
                    ),
                  ),
                }}
                course={course}
                books={books}
                onUpload={onUpload}
                onLink={onLink}
                onPrepare={onPrepare}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="course-ui">
      <div className="course-toolbar">
        <div>
          <h2 className="font-heavy text-2xl">Your courses</h2>
          <p className="text-sm text-warm-500 mt-2">
            A reading plan for every class.
          </p>
        </div>
        <button className="library-soft" onClick={onImport}>
          <Icon name="plus" />
          Add course
        </button>
      </div>
      {courses.length > 0 && (
        <label className="course-search">
          <Icon name="magnifying-glass" />
          <input
            aria-label="Search courses"
            placeholder="Find a course…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      )}
      <div className="course-grid">
        {courses
          .filter((c) =>
            (c.title + " " + c.code)
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((c) => {
            const stats = courseStats(c, books),
              next = nextSession(c);
            return (
              <button
                className="course-card"
                key={c.id}
                onClick={() => go(`/courses/${c.id}`)}
                aria-label={`Open ${c.title}`}
              >
                <div className="course-art">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest">
                      {c.term}
                    </p>
                    <p className="text-3xl font-mono mt-3">
                      {c.code || "Course"}
                    </p>
                  </div>
                  <Icon name="building-columns" />
                </div>
                <div className="course-card-body">
                  <h3 className="font-heavy text-xl mb-3">{c.title}</h3>
                  <p className="text-xs text-warm-500 mb-5">
                    {c.sessions.length} sessions · {stats.total} required
                    readings
                  </p>
                  <Progress
                    value={stats.percent}
                    label={`${c.title} preparation progress`}
                  />
                  <p className="text-xs text-warm-500 mt-2">
                    {stats.done} of {stats.total} completed
                  </p>
                  {next && (
                    <p className="course-next">
                      Next class · {dateText(next.date)}{" "}
                      <Icon name="arrow-right" />
                    </p>
                  )}
                </div>
              </button>
            );
          })}
      </div>
      {!courses.length && (
        <div className="course-empty">
          <Icon name="graduation-cap" />
          <h3 className="font-heavy text-xl">Your course shelf is ready</h3>
          <p>
            Add a reading plan, then attach EPUBs from your library or upload
            converted readings.
          </p>
          <button className="library-primary" onClick={onImport}>
            Add your first course
          </button>
        </div>
      )}
      {courses.length > 0 &&
        !courses.some((c) =>
          (c.title + " " + c.code).toLowerCase().includes(search.toLowerCase()),
        ) && (
          <p className="text-warm-500 py-8">No courses match that search.</p>
        )}
    </div>
  );
}
function Session({ course, session, books, onUpload, onLink, onPrepare }) {
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const stats = sessionStats(course, session, books);
  const groups = session.groups
    .map((g) => ({
      ...g,
      assignments: g.assignments.filter((a) => {
        const r = course.readings.find((r) => r.id === a.readingId);
        return (
          (filter === "all" ||
            (filter === "required" && a.required !== false) ||
            (filter === "unread" && !readingComplete(r, books))) &&
          (r.title + " " + r.author + " " + g.title + " " + g.lecturer)
            .toLowerCase()
            .includes(search.toLowerCase())
        );
      }),
    }))
    .filter((g) => g.assignments.length);
  return (
    <div className="course-ui">
      <Crumbs course={course} session={session} />
      <p className="font-mono text-xs text-warm-500">
        {course.title} · {session.format}
      </p>
      <h2 className="font-heavy text-3xl my-3">{dateText(session.date)}</h2>
      <p className="text-sm text-warm-500 mb-6">{session.title}</p>
      <Progress value={stats.percent} label="Session preparation progress" />
      <div className="course-toolbar mt-6">
        <div className="flex flex-wrap gap-3">
          <select
            className="course-select"
            aria-label="Filter session readings"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All readings</option>
            <option value="required">Required only</option>
            <option value="unread">Still to read</option>
          </select>
          <label className="course-search">
            <Icon name="magnifying-glass" />
            <input
              aria-label="Search session readings"
              placeholder="Find a reading or topic…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <p className="text-xs text-warm-500">
          {stats.done} / {stats.total} required readings complete
        </p>
      </div>
      {groups.map((group) => (
        <section key={group.id} className="course-group">
          <h3 className="font-heavy text-xl">{group.title}</h3>
          <p className="text-xs text-warm-500 mt-2 mb-4">{group.lecturer}</p>
          <div className="space-y-3">
            {group.assignments.map((a) => (
              <ReadingRow
                key={a.readingId}
                reading={course.readings.find((r) => r.id === a.readingId)}
                assignment={a}
                course={course}
                session={session}
                books={books}
                onUpload={onUpload}
                onLink={onLink}
                onPrepare={onPrepare}
              />
            ))}
          </div>
        </section>
      ))}
      {!groups.length && (
        <p className="text-warm-500 py-12">No readings match this view.</p>
      )}
      <p className="text-xs text-warm-500 mt-8">
        <Icon name="language" /> Complete either language edition. Repeated
        readings share the same saved progress.
      </p>
    </div>
  );
}
function ReadingRow({
  reading,
  assignment,
  course,
  session,
  books,
  onUpload,
  onLink,
  onPrepare,
}) {
  const [language, setLanguage] = useState(
      () =>
        reading.editions.find(
          (e) => Number(editionBook(e, books)?.percentage) > 0,
        )?.language || reading.editions[0].language,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const edition =
      reading.editions.find((e) => e.language === language) ||
      reading.editions[0],
    book = editionBook(edition, books),
    complete = readingComplete(reading, books),
    selectedDone = editionComplete(edition, books),
    pdf = safeUrl(edition.pdfUrl || book?.originalPdfUrl);
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      await onPrepare(book.id, !selectedDone);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="course-reading">
      <div className={`course-reading-icon ${complete ? "complete" : ""}`}>
        <Icon name={complete ? "check" : "file-lines"} />
      </div>
      <div className="course-reading-body">
        <h4 className="font-bold text-base">{reading.title}</h4>
        <p className="text-xs text-warm-500 mt-1">{reading.author}</p>
        <div className="course-reading-meta">
          <span>{reading.type}</span>
          {(edition.minutes || assignment.minutes) && (
            <span>
              <Icon name="clock" /> {edition.minutes || assignment.minutes} min
            </span>
          )}
          {edition.pages && <span>{edition.pages} pages</span>}
          {assignment.pages && <span>Pages {assignment.pages}</span>}
          <div
            className="course-editions"
            role="group"
            aria-label={`Language for ${reading.title}`}
          >
            {reading.editions.map((e) => (
              <button
                key={e.language}
                className={e.language === language ? "active" : ""}
                aria-pressed={e.language === language}
                onClick={() => setLanguage(e.language)}
              >
                {e.language}
              </button>
            ))}
          </div>
          {assignment.required === false && (
            <span className="course-tag optional">Optional</span>
          )}
          {book && Number(book.percentage) > 0 && (
            <span>{book.percentage}% read</span>
          )}
          {complete && !selectedDone && (
            <span className="course-tag">Prepared in another edition</span>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-600 mt-2">
            {error}
          </p>
        )}
      </div>
      <div className="course-reading-actions">
        {pdf && (
          <a
            className="library-soft text-xs"
            href={pdf}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Original PDF of ${reading.title}, ${language}`}
          >
            <Icon name="file-pdf" />
          </a>
        )}
        {book?.fileUrl ? (
          <>
            <button
              disabled={busy}
              className={`course-complete ${selectedDone ? "complete" : ""}`}
              aria-label={`${selectedDone ? "Mark unprepared" : "Mark prepared"}: ${reading.title}, ${language}`}
              aria-pressed={selectedDone}
              onClick={prepare}
            >
              <Icon name={busy ? "hourglass-half" : "check"} />
            </button>
            <a
              className="library-soft"
              href={readerHref(book.id, course.id, session?.id)}
            >
              {Number(book.percentage) > 0 ? "Continue" : "Read"}
              <Icon name="arrow-right" />
            </a>
          </>
        ) : (
          <>
            <button
              className="library-soft"
              onClick={() => onLink({ course, reading, edition })}
            >
              Attach EPUB
            </button>
            <button
              className="library-primary"
              onClick={() => onUpload({ course, reading, edition })}
            >
              <Icon name="plus" />
              Upload
            </button>
          </>
        )}
      </div>
    </article>
  );
}
export function CourseImport({ onClose, onImport }) {
  const [plan, setPlan] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function parse(text) {
    try {
      setPlan(validateCourse(JSON.parse(text)));
      setError("");
    } catch (error) {
      setPlan(null);
      setError(error.message);
    }
  }
  async function preset() {
    setBusy(true);
    try {
      const response = await fetch("course-plans/mpp502.json");
      if (!response.ok) throw new Error("The reading plan could not load.");
      await parse(await response.text());
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onImport(plan);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Add a course" onClose={onClose} busy={busy}>
      <p className="text-sm text-warm-500 mb-5">
        Start with a reading plan. Attach your converted EPUBs after adding the
        course.
      </p>
      <button
        className="library-soft w-full mb-5"
        disabled={busy}
        onClick={preset}
      >
        <Icon name="graduation-cap" />
        Use the MPP-502 reading plan
      </button>
      <label className="library-label">
        Or import a course JSON file
        <input
          type="file"
          accept=".json,application/json"
          className="text-xs mt-2"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 800000) {
              setError("Choose a reading plan smaller than 800 KB.");
              return;
            }
            await parse(await file.text());
          }}
        />
      </label>
      {plan && (
        <div className="bg-warm-100 rounded-xl p-4 my-5">
          <h3 className="font-bold">{plan.title}</h3>
          <p className="text-xs text-warm-500 mt-2">
            {plan.sessions.length} sessions · {plan.readings.length} readings ·{" "}
            {plan.term}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-600 text-sm my-4">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3 mt-6">
        <button className="library-soft" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="library-primary"
          disabled={!plan || busy}
          onClick={submit}
        >
          {busy ? "Adding…" : "Add course"}
        </button>
      </div>
    </Dialog>
  );
}
export function EditionLink({ context, books, onClose, onLink }) {
  const [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const available = books.filter((b) => b.fileUrl && !b.courseId);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLink(
        context,
        available.find((b) => b.id === selected),
      );
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={`Attach EPUB · ${context.edition.language}`}
      onClose={onClose}
      busy={busy}
    >
      <p className="text-sm text-warm-500 mb-5">{context.reading.title}</p>
      <form onSubmit={submit}>
        <label className="library-label">
          Choose from your library
          <select
            className="library-input"
            required
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a book…</option>
            {available.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} · {b.author}
              </option>
            ))}
          </select>
        </label>
        {!available.length && (
          <p className="text-sm text-warm-500 mt-4">
            No unattached EPUBs are available. Close this window and upload the
            reading instead.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600 mt-4">
            {error}
          </p>
        )}
        <div className="flex gap-3 justify-end mt-6">
          <button
            type="button"
            className="library-soft"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="library-primary" disabled={!selected || busy}>
            {busy ? "Attaching…" : "Attach reading"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

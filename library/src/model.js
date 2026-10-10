export const isCourse = (record) => record.kind === "course";
export const isCourseEdition = (book) => !!book.courseId;
export function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export const editionBook = (edition, books) =>
  books.find((book) => book.id === edition.bookId);
export const editionComplete = (edition, books) => {
  const book = editionBook(edition, books);
  return (
    !!book &&
    (typeof book.preparationComplete === "boolean"
      ? book.preparationComplete
      : book.status === "finished" || Number(book.percentage) >= 99)
  );
};
export const readingComplete = (reading, books) =>
  reading.editions.some((edition) => editionComplete(edition, books));
export function sessionStats(course, session, books) {
  const ids = [
    ...new Set(
      session.groups.flatMap((group) =>
        group.assignments
          .filter((a) => a.required !== false)
          .map((a) => a.readingId),
      ),
    ),
  ];
  const done = ids.filter((id) =>
    readingComplete(
      course.readings.find((r) => r.id === id),
      books,
    ),
  ).length;
  return {
    done,
    total: ids.length,
    percent: ids.length ? Math.round((done / ids.length) * 100) : 0,
  };
}
export function courseStats(course, books) {
  const ids = [
    ...new Set(
      course.sessions.flatMap((session) =>
        session.groups.flatMap((group) =>
          group.assignments
            .filter((a) => a.required !== false)
            .map((a) => a.readingId),
        ),
      ),
    ),
  ];
  const done = ids.filter((id) =>
    readingComplete(
      course.readings.find((r) => r.id === id),
      books,
    ),
  ).length;
  return {
    done,
    total: ids.length,
    percent: ids.length ? Math.round((done / ids.length) * 100) : 0,
  };
}
export function nextSession(
  course,
  today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }),
) {
  return [...course.sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((s) => s.date >= today);
}
export const FOCUS_MAX = 300;
export function cleanFocus(value) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, FOCUS_MAX);
  return text || null;
}
// A focus narrows the assignment, so its own estimate wins over the edition's full-length one.
export function assignmentMinutes(assignment, edition) {
  if (assignment.focus && assignment.minutes) return assignment.minutes;
  return edition?.minutes || assignment.minutes || null;
}
export function sessionMinutes(course, session) {
  const seen = new Set();
  let total = 0;
  for (const group of session.groups)
    for (const a of group.assignments) {
      if (a.required === false || seen.has(a.readingId)) continue;
      seen.add(a.readingId);
      const reading = course.readings.find((r) => r.id === a.readingId);
      total +=
        assignmentMinutes(
          a,
          reading?.editions.find((e) => e.minutes),
        ) || 0;
    }
  return total;
}
export function withFocus(course, sessionId, groupId, readingId, focus) {
  let found = false;
  const sessions = course.sessions.map((s) =>
    s.id !== sessionId
      ? s
      : {
          ...s,
          groups: s.groups.map((g) =>
            g.id !== groupId
              ? g
              : {
                  ...g,
                  assignments: g.assignments.map((a) => {
                    if (a.readingId !== readingId) return a;
                    found = true;
                    return { ...a, focus: cleanFocus(focus) };
                  }),
                },
          ),
        },
  );
  if (!found) throw new Error("That reading is no longer in this session.");
  return sessions;
}
export function readerHref(bookId, courseId, sessionId) {
  const query = new URLSearchParams({ id: bookId });
  if (courseId) query.set("course", courseId);
  if (sessionId) query.set("session", sessionId);
  return `reader.html?${query}`;
}
export function validateCourse(input) {
  const fail = (message) => {
    throw new Error(message);
  };
  const text = (value, label, max = 300) => {
    if (typeof value !== "string" || !value.trim() || value.length > max)
      fail(`${label} is missing or too long.`);
    return value.trim();
  };
  const id = (value, label) => {
    const result = text(value, label, 100);
    if (!/^[a-zA-Z0-9_-]+$/.test(result))
      fail(`${label} must use letters, numbers, hyphens, or underscores.`);
    return result;
  };
  const unique = (values, label) => {
    if (new Set(values).size !== values.length) fail(`Duplicate ${label}.`);
  };
  if (!input || typeof input !== "object")
    fail("Choose a valid course JSON file.");
  if (
    !Array.isArray(input.readings) ||
    !Array.isArray(input.sessions) ||
    input.readings.length > 500 ||
    input.sessions.length > 100
  )
    fail(
      "A course needs readings and sessions (up to 500 readings and 100 sessions).",
    );
  const readings = input.readings.map((r) => {
    if (
      !Array.isArray(r.editions) ||
      !r.editions.length ||
      r.editions.length > 10
    )
      fail("Every reading needs at least one language edition.");
    const editions = r.editions.map((e) => {
      if (
        e.bookId !== undefined &&
        e.bookId !== null &&
        (typeof e.bookId !== "string" || !e.bookId || e.bookId.includes("/"))
      )
        fail("Edition book IDs must refer to a library document.");
      if (e.pdfUrl && !safeUrl(e.pdfUrl))
        fail("Original PDF links must use HTTP or HTTPS.");
      return {
        language: text(e.language, "Language", 20),
        bookId: e.bookId || null,
        pdfUrl: safeUrl(e.pdfUrl),
        pages: Number(e.pages) > 0 ? Number(e.pages) : null,
        minutes: Number(e.minutes) > 0 ? Number(e.minutes) : null,
      };
    });
    unique(
      editions.map((e) => e.language),
      "languages in a reading",
    );
    return {
      id: id(r.id, "Reading ID"),
      title: text(r.title, "Reading title"),
      author: typeof r.author === "string" ? r.author.slice(0, 300) : "",
      type: typeof r.type === "string" ? r.type.slice(0, 60) : "Reading",
      editions,
    };
  });
  unique(
    readings.map((r) => r.id),
    "reading IDs",
  );
  const readingIds = new Set(readings.map((r) => r.id));
  const sessions = input.sessions.map((s) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
      Number.isNaN(Date.parse(s.date + "T12:00:00")) ||
      new Date(s.date + "T12:00:00Z").toISOString().slice(0, 10) !== s.date
    )
      fail("Session dates must be valid YYYY-MM-DD dates.");
    if (!Array.isArray(s.groups) || s.groups.length > 50)
      fail("A session needs a list of topic groups.");
    const groups = s.groups.map((g) => {
      if (!Array.isArray(g.assignments) || g.assignments.length > 500)
        fail("A topic needs a reading assignment list.");
      const assignments = g.assignments.map((a) => {
        if (!readingIds.has(a.readingId))
          fail(`Unknown reading: ${a.readingId}`);
        return {
          readingId: a.readingId,
          required: a.required !== false,
          minutes: Number(a.minutes) > 0 ? Number(a.minutes) : null,
          pages: typeof a.pages === "string" ? a.pages.slice(0, 100) : null,
          focus: cleanFocus(a.focus),
        };
      });
      unique(
        assignments.map((a) => a.readingId),
        "assignments in a topic",
      );
      return {
        id: id(g.id, "Topic ID"),
        title: text(g.title, "Topic title"),
        lecturer:
          typeof g.lecturer === "string" ? g.lecturer.slice(0, 300) : "",
        assignments,
      };
    });
    unique(
      groups.map((g) => g.id),
      "topic IDs",
    );
    return {
      id: id(s.id, "Session ID"),
      date: s.date,
      title: text(s.title, "Session title"),
      format: typeof s.format === "string" ? s.format.slice(0, 60) : "Class",
      groups,
    };
  });
  unique(
    sessions.map((s) => s.id),
    "session IDs",
  );
  return {
    schemaVersion: 1,
    kind: "course",
    title: text(input.title, "Course title"),
    code: typeof input.code === "string" ? input.code.slice(0, 60) : "",
    term: typeof input.term === "string" ? input.term.slice(0, 100) : "",
    description:
      typeof input.description === "string"
        ? input.description.slice(0, 1000)
        : "",
    readings,
    sessions,
  };
}

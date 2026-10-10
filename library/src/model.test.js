import { describe, it, expect } from "vitest";
import {
  validateCourse,
  sessionStats,
  courseStats,
  readerHref,
  safeUrl,
  sessionMinutes,
  assignmentMinutes,
} from "./model";

import { plan } from "./test-fixture";
import mppPlan from "../course-plans/mpp502.json";

describe("course preparation", () => {
  it("loads the real MPP-502 plan without content files or invented book progress", () => {
    const course = validateCourse(mppPlan);
    expect(course.sessions).toHaveLength(6);
    expect(course.readings).toHaveLength(62);
    expect(course.readings.flatMap((r) => r.editions)).toHaveLength(75);
    expect(
      course.readings.every((r) =>
        r.editions.every((e) => !e.bookId && !e.pdfUrl),
      ),
    ).toBe(true);
    expect(courseStats(course, [])).toEqual({ done: 0, total: 53, percent: 0 });
    expect(
      course.sessions.every((s) =>
        s.groups.every((g) => g.assignments.every((a) => a.focus)),
      ),
    ).toBe(true);
  });
  it("counts either language once, shares completion across sessions, and excludes optional readings", () => {
    const course = validateCourse(plan),
      books = [
        { id: "en", percentage: 25, status: "reading" },
        { id: "vi", percentage: 100, status: "finished" },
      ];
    expect(sessionStats(course, course.sessions[0], books)).toEqual({
      done: 1,
      total: 1,
      percent: 100,
    });
    expect(sessionStats(course, course.sessions[1], books).done).toBe(1);
    expect(courseStats(course, books)).toEqual({
      done: 1,
      total: 1,
      percent: 100,
    });
  });
  it("does not treat missing EPUBs as completed and permits explicit preparation overrides", () => {
    const course = validateCourse(plan);
    expect(courseStats(course, []).done).toBe(0);
    expect(
      courseStats(course, [
        {
          id: "en",
          percentage: 100,
          status: "finished",
          preparationComplete: false,
        },
      ]).done,
    ).toBe(0);
    expect(
      courseStats(course, [
        {
          id: "en",
          percentage: 25,
          currentCfi: "saved-location",
          preparationComplete: true,
        },
      ]).done,
    ).toBe(1);
  });
  it("rejects unsafe URLs, broken dates, duplicate identities, and missing reading references", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(() =>
      validateCourse({
        ...plan,
        readings: [
          {
            id: "x",
            title: "X",
            editions: [{ language: "EN", pdfUrl: "javascript:alert(1)" }],
          },
        ],
      }),
    ).toThrow(/HTTP/);
    expect(() =>
      validateCourse({
        ...plan,
        sessions: [{ ...plan.sessions[0], date: "2026-02-31" }],
      }),
    ).toThrow(/date/);
    expect(() =>
      validateCourse({
        ...plan,
        readings: [plan.readings[0], plan.readings[0]],
      }),
    ).toThrow(/Duplicate/);
    expect(() => validateCourse({ ...plan, readings: [] })).toThrow(
      /Unknown reading/,
    );
  });
  it("preserves the existing reader ID and adds course return context", () => {
    const url = new URL(
      readerHref("legacy-book", "course-1", "day1"),
      "https://example.com/Personal_Web/library/",
    );
    expect(url.pathname).toBe("/Personal_Web/library/reader.html");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      id: "legacy-book",
      course: "course-1",
      session: "day1",
    });
  });
  it("cleans focus notes and lets a narrowed estimate replace the full-length one", () => {
    const course = validateCourse({
      ...plan,
      readings: [
        {
          id: "chapter",
          title: "Chapter",
          editions: [
            { language: "EN", minutes: 250 },
            { language: "VI", minutes: 300 },
          ],
        },
        plan.readings[1],
      ],
      sessions: [
        {
          ...plan.sessions[0],
          groups: [
            {
              ...plan.sessions[0].groups[0],
              assignments: [
                {
                  readingId: "chapter",
                  minutes: 60,
                  focus: "  pp. 117\n to 148 ",
                },
                { readingId: "extra", required: false, focus: "   " },
              ],
            },
          ],
        },
      ],
    });
    const [focused, blank] = course.sessions[0].groups[0].assignments;
    expect(focused.focus).toBe("pp. 117 to 148");
    expect(blank.focus).toBeNull();
    expect(assignmentMinutes(focused, course.readings[0].editions[1])).toBe(60);
    expect(
      assignmentMinutes({ minutes: 60, focus: null }, { minutes: 300 }),
    ).toBe(300);
    expect(sessionMinutes(course, course.sessions[0])).toBe(60);
    expect(
      validateCourse({
        ...plan,
        sessions: [
          {
            ...plan.sessions[0],
            groups: [
              {
                ...plan.sessions[0].groups[0],
                assignments: [{ readingId: "chapter", focus: "x".repeat(900) }],
              },
            ],
          },
        ],
      }).sessions[0].groups[0].assignments[0].focus,
    ).toHaveLength(300);
  });
});

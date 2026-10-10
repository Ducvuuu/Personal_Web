export const plan = {
  title: "Policy",
  code: "MPP-502",
  term: "October 2026",
  readings: [
    {
      id: "chapter",
      title: "Chapter",
      editions: [
        { language: "EN", bookId: "en" },
        { language: "VI", bookId: "vi" },
      ],
    },
    {
      id: "extra",
      title: "Extra",
      editions: [{ language: "EN", bookId: "extra" }],
    },
  ],
  sessions: [
    {
      id: "day1",
      date: "2026-10-13",
      title: "First class",
      groups: [
        {
          id: "topic",
          title: "Topic",
          assignments: [
            { readingId: "chapter" },
            { readingId: "extra", required: false },
          ],
        },
      ],
    },
    {
      id: "day2",
      date: "2026-10-14",
      title: "Second class",
      groups: [
        {
          id: "topic",
          title: "Topic",
          assignments: [{ readingId: "chapter" }],
        },
      ],
    },
  ],
};

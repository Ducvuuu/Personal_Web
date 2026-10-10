# Library and Courses

The Library uses React for the bookshelf, course screens and reader controls. Its existing visual style and Firebase book documents are retained. Other site sections remain static HTML and JavaScript.

## Development and deployment

Use Node.js 22. Run `npm ci`, then `npm run dev` and open `/library/`. Run `npm test` for the migration checks and `npm run build` to create the complete site in `dist/`. `npm run preview` serves that build. Opening the source HTML directly no longer runs the Library.

The Pages workflow checks pull requests without deploying them. Before merging the migration, set **Repository Settings > Pages > Build and deployment > Source** to **GitHub Actions**. The existing site uses branch publishing, and the normal workflow token cannot change this administration setting. On main, the workflow publishes `dist/`. The build includes the existing home, about, journal, writing, shared assets and root redirect. The relative asset paths also support the `/Personal_Web/` GitHub Pages prefix.

## Adding a course

Sign in, open **Courses**, select **Add course**, and choose the MPP-502 reading plan or import your own JSON plan. Review its title and counts before adding it. The bundled plan describes six sessions, 59 distinct readings with 72 language editions, and three additional course documents (the syllabus and two lecture documents). It includes reading metadata only. Course PDFs and converted EPUBs are not published in the repository.

Open a session to see readings grouped by topic and lecturer. Select EN or VI where both are available. **Attach EPUB** connects an existing library book to that edition; **Upload** uploads a converted EPUB with its title, author and optional cover. Attached editions appear in Courses instead of the general Books shelf. Existing bookmarks and highlights remain in the original book document.

An edition can also include an `https://` original PDF link in its JSON plan. The PDF button opens that source separately. The EPUB remains the readable, reflowable edition used by the current reader. This release does not convert PDFs automatically.

Completing either language prepares a reading. Repeated assignments refer to one reading identity and share its progress. Optional readings do not increase required totals. The manual preparation check changes `preparationComplete` without changing the EPUB bookmark or percentage. Finishing the EPUB sets preparation complete automatically.

## Storage contract

Existing books remain in `users/{uid}/library/{bookId}` with their existing fields. EPUB and cover uploads retain `library/{uid}/books/{bookId}.epub` and `library/{uid}/covers/{bookId}.{extension}`. All operations require the current authenticated owner. Existing deployed Firebase rules must allow the owner to read and write these paths; this change does not broaden access or modify rules.

Course plans are documents in the same library collection with `kind: "course"`, `schemaVersion: 1`, `title`, `code`, `term`, `description`, `readings`, `sessions` and `uploadedAt`. Ordinary books have no `kind: "course"` field. `readings[].editions[].bookId` refers to the existing book document. Attaching an EPUB uses a Firestore transaction to verify both current records and updates only the reading reference and book attachment metadata: `courseId`, `readingId`, `language`, `originalPdfUrl`.

Example plan:

```json
{
  "title": "Introduction to Public Policy",
  "code": "MPP-502",
  "term": "October 2026",
  "readings": [
    {
      "id": "reading-1",
      "title": "Reading title",
      "author": "Author",
      "type": "Chapter",
      "editions": [
        {
          "language": "EN",
          "bookId": null,
          "pdfUrl": null,
          "pages": 21,
          "minutes": 45
        },
        { "language": "VI", "bookId": null, "pdfUrl": null }
      ]
    }
  ],
  "sessions": [
    {
      "id": "oct13",
      "date": "2026-10-13",
      "title": "Why public policy?",
      "format": "On campus",
      "groups": [
        {
          "id": "policy-process",
          "title": "The policy process",
          "lecturer": "Lecturer name",
          "assignments": [
            { "readingId": "reading-1", "required": true, "pages": "1-21" }
          ]
        }
      ]
    }
  ]
}
```

The validator rejects duplicate identities, invalid dates, missing reading references and unsafe PDF links. Progress is derived from actual attached books, rather than stored as mock course percentages.

## Reader integration

React mounts `ReaderShell.jsx` once. `reader-engine.js` then loads `reader.js` followed by `rsvp.js` as classic scripts, preserving their shared lexical state. The original engines still own EPUB rendering, pagination, highlights, progress saves and RSVP playback. Keep those DOM targets stable and avoid React rerenders of engine-owned content. Appearance controls use `#settings-toggle` for the outside-click guard rather than relying on inline HTML event attributes.

The existing `reader.html?id={bookId}` URLs still work. Optional `course` and `session` parameters give the reader a return link to its class session. See `RSVP.md` for engine details.

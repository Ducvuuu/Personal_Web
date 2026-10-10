import { isCourse, validateCourse, withFocus } from "./model";

export function createLibraryRepository(firebase, uid) {
  const { auth, db, storage, serverTimestamp } = firebase;
  const library = db.collection("users").doc(uid).collection("library");
  const requireOwner = () => {
    if (auth.currentUser?.uid !== uid)
      throw new Error("Your library was locked. Sign in again to continue.");
  };
  const deleteObject = async (path) => {
    try {
      await storage.ref(path).delete();
    } catch (error) {
      if (error.code !== "storage/object-not-found") throw error;
    }
  };
  return {
    subscribe(onData, onError) {
      requireOwner();
      return library.orderBy("uploadedAt", "desc").onSnapshot((snapshot) => {
        if (auth.currentUser?.uid !== uid) return;
        const records = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        try {
          onData({
            books: records.filter((r) => !isCourse(r)),
            courses: records
              .filter(isCourse)
              .map((r) => ({ ...validateCourse(r), id: r.id })),
          });
        } catch (error) {
          onError(error);
        }
      }, onError);
    },
    async createCourse(plan) {
      requireOwner();
      const course = validateCourse(plan);
      const doc = library.doc();
      await doc.set({ ...course, uploadedAt: serverTimestamp() });
      return doc.id;
    },
    async linkEdition(course, readingId, language, book) {
      requireOwner();
      const courseRef = library.doc(course.id),
        bookRef = library.doc(book.id);
      // Re-read both records so attachments from another device cannot be overwritten.
      await db.runTransaction(async (transaction) => {
        const [courseSnap, bookSnap] = await Promise.all([
          transaction.get(courseRef),
          transaction.get(bookRef),
        ]);
        requireOwner();
        if (!courseSnap.exists || !bookSnap.exists)
          throw new Error("The course or EPUB no longer exists.");
        const currentCourse = validateCourse(courseSnap.data()),
          currentBook = bookSnap.data();
        if (!currentBook.fileUrl)
          throw new Error("Choose a book with an uploaded EPUB.");
        if (
          currentBook.courseId &&
          (currentBook.courseId !== course.id ||
            currentBook.readingId !== readingId ||
            currentBook.language !== language)
        )
          throw new Error(
            "This EPUB is already attached to another course edition.",
          );
        const reading = currentCourse.readings.find((r) => r.id === readingId),
          edition = reading?.editions.find((e) => e.language === language);
        if (!edition) throw new Error("That reading edition no longer exists.");
        if (edition.bookId && edition.bookId !== book.id)
          throw new Error("This edition already has an EPUB attached.");
        const readings = currentCourse.readings.map((r) =>
          r.id !== readingId
            ? r
            : {
                ...r,
                editions: r.editions.map((e) =>
                  e.language !== language ? e : { ...e, bookId: book.id },
                ),
              },
        );
        transaction.update(courseRef, { readings });
        transaction.update(bookRef, {
          courseId: course.id,
          readingId,
          language,
          originalPdfUrl: edition.pdfUrl || currentBook.originalPdfUrl || null,
        });
      });
    },
    async setFocus(courseId, sessionId, groupId, readingId, focus) {
      requireOwner();
      const courseRef = library.doc(courseId);
      // Re-read the course so an attachment saved on another device is kept.
      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(courseRef);
        requireOwner();
        if (!snap.exists) throw new Error("This course no longer exists.");
        const current = validateCourse(snap.data());
        transaction.update(courseRef, {
          sessions: withFocus(current, sessionId, groupId, readingId, focus),
        });
      });
    },
    async markPrepared(bookId, complete) {
      requireOwner();
      await library.doc(bookId).update({ preparationComplete: complete });
    },
    async uploadBook(file, details, onProgress) {
      requireOwner();
      const doc = library.doc(),
        paths = [];
      const epubPath = `library/${uid}/books/${doc.id}.epub`;
      const upload = async (path, file, progress) => {
        paths.push(path);
        const ref = storage.ref(path),
          task = ref.put(file);
        await new Promise((resolve, reject) => {
          const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user?.uid !== uid) task.cancel();
          });
          task.on(
            "state_changed",
            (snapshot) =>
              progress?.(
                snapshot.totalBytes
                  ? snapshot.bytesTransferred / snapshot.totalBytes
                  : 0,
              ),
            (error) => {
              unsubscribe();
              reject(error);
            },
            () => {
              unsubscribe();
              resolve();
            },
          );
        });
        requireOwner();
        return ref.getDownloadURL();
      };
      try {
        const fileUrl = await upload(epubPath, file, (p) =>
          onProgress?.(Math.round(10 + p * 70), "Uploading book…"),
        );
        let coverUrl = null,
          coverPath = null;
        if (details.coverFile) {
          const ext =
            details.coverFile.name
              .split(".")
              .pop()
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "") || "jpg";
          coverPath = `library/${uid}/covers/${doc.id}.${ext}`;
          coverUrl = await upload(coverPath, details.coverFile, (p) =>
            onProgress?.(Math.round(80 + p * 15), "Uploading cover…"),
          );
        }
        requireOwner();
        onProgress?.(97, "Saving to library…");
        await doc.set({
          title: details.title,
          author: details.author,
          category: details.category,
          fileUrl,
          coverUrl,
          coverPath,
          status: "unread",
          percentage: 0,
          currentChapter: "",
          currentCfi: "",
          highlights: [],
          lastRead: null,
          uploadedAt: serverTimestamp(),
        });
        return { id: doc.id, fileUrl };
      } catch (error) {
        // A failed metadata write must not leave an invisible upload behind.
        await Promise.allSettled(paths.map(deleteObject));
        throw error;
      }
    },
    async deleteBook(book, courses) {
      requireOwner();
      if (
        courses.some((c) =>
          c.readings.some((r) => r.editions.some((e) => e.bookId === book.id)),
        )
      )
        throw new Error(
          "This EPUB is used by a course. Keep it attached to preserve the course reading.",
        );
      await deleteObject(`library/${uid}/books/${book.id}.epub`);
      let coverPath = book.coverPath;
      if (!coverPath && book.coverUrl) {
        try {
          coverPath = storage.refFromURL(book.coverUrl).fullPath;
        } catch {}
      }
      if (coverPath?.startsWith(`library/${uid}/covers/${book.id}.`))
        await deleteObject(coverPath);
      requireOwner();
      await library.doc(book.id).delete();
    },
  };
}

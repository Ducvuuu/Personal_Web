import React, { useEffect, useState } from "react";
import { mountReaderEngine } from "./reader-engine";

export default function ReaderShell() {
  const [failure, setFailure] = useState("");
  const params = new URLSearchParams(window.location.search);
  const course = params.get("course"),
    session = params.get("session");
  const returnHref = course
    ? `index.html#/courses/${encodeURIComponent(course)}${session ? "/sessions/" + encodeURIComponent(session) : ""}`
    : "index.html";
  const returnLabel = course ? "Back to course session" : "Back to library";
  useEffect(() => {
    mountReaderEngine().catch((error) => setFailure(error.message));
  }, []);
  return (
    <>
      {failure && (
        <div
          role="alert"
          className="fixed inset-0 z-[100] bg-warm-50 p-10 text-warm-900"
        >
          <h1 className="text-xl font-bold">The reader could not open</h1>
          <p className="my-4">{failure}</p>
          <a href={returnHref}>Back to library</a>
        </div>
      )}

      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/70 backdrop-blur-md"
        id="auth-gate"
      >
        <div className="bg-warm-50 rounded-[2rem] border border-warm-200 shadow-2xl p-10 w-full max-w-sm relative mx-4">
          <div
            className="absolute top-0 left-1/2 w-24 h-7 bg-white/50 backdrop-blur-sm border border-white/20 rounded"
            style={{ transform: "translateX(-50%) rotate(-1.5deg)" }}
          ></div>
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-warm-100 border border-warm-200 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <i
                aria-hidden="true"
                className="fa-solid fa-book-open text-warm-400 text-xl"
              ></i>
            </div>
            <h1
              className="font-heavy text-2xl text-warm-900 mb-1"
              style={{ fontFamily: "'Outfit',sans-serif", fontWeight: "900" }}
            >
              The Library
            </h1>
            <p className="font-mono text-xs text-warm-400 uppercase tracking-widest">
              Private collection … authorised only
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label
                className="font-mono text-[10px] text-warm-500 uppercase tracking-widest block mb-1.5"
                htmlFor="login-email"
              >
                Email
              </label>
              <input
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-warm-200 text-sm font-mono text-warm-800 placeholder-warm-300 focus:outline-none focus:border-warm-400 focus:ring-1 focus:ring-warm-400 shadow-inner"
                id="login-email"
                placeholder="your@email.com"
                type="email"
              />
            </div>
            <div>
              <label
                className="font-mono text-[10px] text-warm-500 uppercase tracking-widest block mb-1.5"
                htmlFor="login-password"
              >
                Password
              </label>
              <input
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-warm-200 text-sm font-mono text-warm-800 placeholder-warm-300 focus:outline-none focus:border-warm-400 focus:ring-1 focus:ring-warm-400 shadow-inner"
                id="login-password"
                onKeyDown={(event) => {
                  if (event.key === "Enter") window.login?.();
                }}
                placeholder="••••••••"
                type="password"
              />
            </div>
            <p
              className="font-mono text-xs text-red-500 hidden"
              id="login-error"
            >
              <i
                aria-hidden="true"
                className="fa-solid fa-triangle-exclamation mr-1"
              ></i>
              <span id="login-error-msg"></span>
            </p>
            <button
              className="w-full bg-warm-900 text-warm-50 font-mono font-bold text-sm py-3 rounded-xl hover:bg-warm-800 transition-colors shadow-sm flex items-center justify-center gap-2 mt-2"
              id="login-btn"
              onClick={() => window.login?.()}
            >
              <i
                aria-hidden="true"
                className="fa-solid fa-lock text-xs text-warm-400"
              ></i>{" "}
              Open the library
            </button>
          </div>
        </div>
      </div>

      <div
        className="reader-ui fixed top-0 left-0 bottom-0 z-40 w-72 bg-warm-50 border-r border-warm-200 shadow-2xl overflow-y-auto"
        id="toc-panel"
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-outfit font-heavy text-lg text-warm-900">
              Contents
            </h3>
            <button
              aria-label="Close contents"
              className="text-warm-400 hover:text-warm-700 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-warm-100"
              onClick={() => window.toggleToc?.()}
            >
              <i aria-hidden="true" className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <ul
            className="space-y-0.5 font-outfit text-sm text-warm-700"
            id="toc-list"
          ></ul>
        </div>
      </div>
      <div
        className="hidden fixed inset-0 z-30"
        id="toc-backdrop"
        onClick={() => window.toggleToc?.()}
      ></div>

      <nav
        className="reader-ui bar-bg fixed top-0 inset-x-0 z-20 flex justify-between items-center px-5 py-3 border-b backdrop-blur-md"
        id="top-nav"
      >
        <a
          aria-label={returnLabel}
          className="flex items-center gap-2 font-mono text-sm font-bold text-warm-500 hover:text-orange-600 transition-colors shrink-0"
          href={returnHref}
        >
          <i aria-hidden="true" className="fa-solid fa-arrow-left"></i>
          <span className="hidden sm:inline">
            {course ? "Session" : "Library"}
          </span>
        </a>
        <a
          id="original-pdf-link"
          className="hidden text-warm-500 text-xs px-2"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original PDF"
        >
          <i className="fa-solid fa-file-pdf" aria-hidden="true" />
        </a>
        <div className="text-center hidden sm:block overflow-hidden px-4">
          <p
            className="font-outfit font-bold text-[10px] tracking-widest uppercase text-warm-400 truncate"
            id="nav-author"
          ></p>
          <h1
            className="font-outfit font-bold text-sm text-warm-800 truncate"
            id="nav-title"
          >
            Loading…
          </h1>
          <span
            className="opacity-0 transition-opacity duration-500 font-outfit text-[11px] flex items-center justify-center gap-1 text-warm-400 mt-0.5"
            id="save-status"
          ></span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            aria-label="Table of contents"
            className="text-warm-400 hover:text-warm-800 transition-colors text-base"
            onClick={() => window.toggleToc?.()}
          >
            <i aria-hidden="true" className="fa-solid fa-list"></i>
          </button>
          <button
            aria-label="Toggle highlight mode"
            aria-pressed="false"
            className="text-warm-400 hover:text-warm-800 transition-colors text-base"
            id="highlight-btn"
            onClick={() => window.toggleHighlightMode?.()}
          >
            <i aria-hidden="true" className="fa-solid fa-highlighter"></i>
          </button>
          <button
            aria-label="Toggle RSVP speed reading"
            aria-pressed="false"
            className="text-warm-400 hover:text-warm-800 transition-colors text-base"
            id="rsvp-btn"
            onClick={() => window.toggleRsvpMode?.()}
          >
            <i aria-hidden="true" className="fa-solid fa-bolt"></i>
          </button>
          <button
            aria-label="Immersive full screen"
            aria-pressed="false"
            className="hidden text-warm-400 hover:text-warm-800 transition-colors text-base"
            id="immersive-btn"
            onClick={() => window.toggleImmersive?.()}
          >
            <i
              aria-hidden="true"
              className="fa-solid fa-expand"
              id="immersive-icon"
            ></i>
          </button>
          <div className="h-4 w-px bg-warm-300"></div>
          <button
            id="settings-toggle"
            aria-label="Appearance settings"
            className="text-warm-400 hover:text-warm-800 transition-colors text-base"
            onClick={() => window.toggleSettings?.()}
          >
            <i aria-hidden="true" className="fa-solid fa-font"></i>
          </button>
        </div>
      </nav>

      <div
        className="reader-ui fixed top-14 right-4 z-50 bg-warm-50 rounded-2xl shadow-2xl border border-warm-200 p-6 w-72 hidden"
        id="settings-panel"
      >
        <h3 className="font-outfit font-bold text-warm-900 mb-4 border-b border-warm-100 pb-2 text-sm tracking-wide">
          Appearance
        </h3>

        <div className="flex gap-2 mb-5">
          <button
            className="theme-btn flex-1 py-2 rounded-xl border-2 border-warm-200 bg-white text-gray-700 font-outfit text-xs font-bold"
            data-theme="light"
            onClick={() => window.setTheme?.("light")}
          >
            Light
          </button>
          <button
            className="theme-btn flex-1 py-2 rounded-xl border-2 border-orange-400 bg-[#fdfcf6] text-warm-900 font-outfit text-xs font-bold ring-2 ring-orange-200 ring-offset-1"
            data-theme="sepia"
            onClick={() => window.setTheme?.("sepia")}
          >
            Sepia
          </button>
          <button
            className="theme-btn flex-1 py-2 rounded-xl border-2 border-gray-700 bg-gray-900 text-gray-300 font-outfit text-xs font-bold"
            data-theme="dark"
            onClick={() => window.setTheme?.("dark")}
          >
            Dark
          </button>
        </div>

        <div className="flex items-center justify-between bg-warm-50 rounded-xl p-1 border border-warm-200 mb-4">
          <button
            aria-label="Decrease font size"
            className="px-4 py-2 hover:bg-white rounded-lg text-warm-600 transition-colors text-sm"
            onClick={() => window.changeFontSize?.(-2)}
          >
            <i aria-hidden="true" className="fa-solid fa-minus"></i>
          </button>
          <span
            className="font-mono text-sm font-bold text-warm-800"
            id="font-size-display"
          >
            18px
          </span>
          <button
            aria-label="Increase font size"
            className="px-4 py-2 hover:bg-white rounded-lg text-warm-600 transition-colors text-sm"
            onClick={() => window.changeFontSize?.(2)}
          >
            <i aria-hidden="true" className="fa-solid fa-plus"></i>
          </button>
        </div>

        <div className="flex gap-2">
          <button
            className="flex-1 py-2 rounded-xl bg-warm-200 text-warm-900 font-book text-sm transition-colors"
            id="btn-serif"
            onClick={() => window.setFont?.("serif")}
          >
            Serif
          </button>
          <button
            className="flex-1 py-2 rounded-xl text-warm-600 font-outfit text-sm hover:bg-warm-100 transition-colors"
            id="btn-sans"
            onClick={() => window.setFont?.("sans")}
          >
            Sans
          </button>
        </div>
      </div>

      <div
        className="hidden fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#fdfcf6]/95 backdrop-blur-sm"
        id="loading-screen"
      >
        <i
          aria-hidden="true"
          className="fa-solid fa-circle-notch spin-slow text-3xl text-warm-300 mb-4"
        ></i>
        <p className="font-mono text-sm text-warm-400" id="loading-text">
          Opening book…
        </p>
      </div>

      <button
        aria-label="Previous page"
        className="nav-arrow left hidden md:flex"
        onClick={() => window.prevPage?.()}
      >
        <i aria-hidden="true" className="fa-solid fa-chevron-left text-sm"></i>
      </button>
      <button
        aria-label="Next page"
        className="nav-arrow right hidden md:flex"
        onClick={() => window.nextPage?.()}
      >
        <i aria-hidden="true" className="fa-solid fa-chevron-right text-sm"></i>
      </button>

      <div
        className="hidden fixed inset-0 pt-[52px] pb-[56px] flex justify-center transition-all duration-250"
        id="reader-area"
      >
        <div className="w-full max-w-2xl h-full">
          <div className="w-full h-full" id="viewer"></div>
        </div>
      </div>

      <div
        className="hidden fixed inset-0 z-40 flex items-center justify-center bg-warm-900/60 backdrop-blur-sm"
        id="rsvp-prep-modal"
      >
        <div className="bg-warm-50 rounded-[2rem] border border-warm-200 shadow-2xl p-10 w-full max-w-sm mx-4 text-center relative">
          <div
            className="absolute top-0 left-1/2 w-28 h-7 bg-white/50 backdrop-blur-sm border border-white/20 rounded"
            style={{ transform: "translateX(-50%) rotate(-1.5deg)" }}
          ></div>
          <div className="w-12 h-12 bg-warm-100 border border-warm-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i
              aria-hidden="true"
              className="fa-solid fa-bolt text-warm-400 text-lg"
            ></i>
          </div>
          <h3
            className="font-outfit font-bold text-lg text-warm-900 mb-1"
            id="rsvp-prep-title"
          >
            Preparing RSVP…
          </h3>
          <p
            className="font-mono text-[10px] text-warm-400 uppercase tracking-widest mb-6"
            id="rsvp-prep-sub"
          >
            Analysing complexity and pacing
          </p>
          <div
            aria-label="Scoring progress"
            aria-valuemax="100"
            aria-valuemin="0"
            aria-valuenow="0"
            className="w-full h-2 bg-warm-200 rounded-full overflow-hidden mb-2"
            role="progressbar"
          >
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-500 rsvp-bar-pulse"
              id="rsvp-prep-bar"
              style={{ width: "0%" }}
            ></div>
          </div>
          <p
            className="font-mono text-[10px] text-warm-500 mb-6"
            id="rsvp-prep-chunk"
          >
            Chapter 0 of 0
          </p>
          <button
            className="font-mono text-[10px] text-warm-400 uppercase tracking-widest hover:text-warm-700 transition"
            onClick={() => window.cancelRsvpPrep?.()}
          >
            Cancel
          </button>
        </div>
      </div>

      <div
        className="fixed top-[52px] bottom-[56px] left-0 z-30 w-full md:w-[320px] md:h-auto md:max-h-[85vh] md:top-24 md:left-24 md:bottom-auto md:rounded-2xl flex flex-col border border-transparent md:border-warm-200 border-r-warm-200 md:bg-[#fdfaf6] shadow-[2px_0_24px_rgba(74,37,23,0.1)] md:shadow-2xl"
        id="rsvp-panel"
      >
        <div
          aria-hidden="true"
          className="hidden md:flex items-center justify-center py-3 cursor-grab active:cursor-grabbing border-b border-warm-100 hover:bg-warm-50 transition-colors shrink-0"
          id="rsvp-drag-handle"
        >
          <div className="w-12 h-1.5 bg-warm-200 rounded-full"></div>
        </div>

        <div
          className="h-48 flex flex-col items-center justify-center relative cursor-pointer select-none border-b border-warm-100 shrink-0 bg-[#fdfaf6]"
          id="rsvp-display-area"
          onClick={() => window.rsvpTogglePlay?.()}
        >
          <div
            className="absolute top-3 left-4 right-4 text-center font-outfit text-[11px] text-warm-400 opacity-0 transition-opacity duration-300 leading-snug italic"
            id="rsvp-context"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: "2",
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          ></div>

          <div
            aria-live="off"
            className="font-outfit font-black text-5xl text-warm-900 tracking-tight flex items-baseline justify-center w-full px-4"
            id="rsvp-word"
          >
            <span id="rsvp-before"></span>
            <span className="text-red-600" id="rsvp-pivot"></span>
            <span id="rsvp-after"></span>
          </div>

          <div className="absolute bottom-5 w-1.5 h-1.5 bg-orange-400 rounded-full opacity-50 shadow-[0_0_6px_rgba(235,173,122,0.9)]"></div>
        </div>

        <div
          aria-label="Reading progress"
          aria-valuemax="100"
          aria-valuemin="0"
          aria-valuenow="0"
          className="w-full h-1.5 bg-warm-100 shrink-0"
          role="progressbar"
        >
          <div
            className="h-full bg-orange-500 rounded-r-full transition-all duration-100"
            id="rsvp-progress"
            style={{ width: "0%" }}
          ></div>
        </div>

        <div className="flex flex-col flex-1 md:overflow-y-auto">
          <div className="px-5 py-4 flex flex-col gap-4 bg-white shrink-0">
            <div className="flex justify-between items-center gap-2">
              <span
                className="shrink-0 px-2.5 py-1 rounded-full font-mono text-[9px] font-bold uppercase tracking-widest bg-warm-100 text-warm-700 border border-warm-200"
                id="rsvp-status"
              >
                Ready
              </span>
              <span
                className="font-mono text-[9px] text-warm-400 uppercase tracking-widest truncate text-right"
                id="rsvp-chapter-badge"
              ></span>
            </div>

            <div className="flex items-center justify-center gap-4">
              <button
                aria-label="Restart book"
                className="p-2 text-warm-400 hover:text-warm-700 hover:bg-warm-50 rounded-full transition"
                onClick={() => window.rsvpRestart?.()}
              >
                <i
                  aria-hidden="true"
                  className="fa-solid fa-rotate-left text-sm"
                ></i>
              </button>
              <button
                aria-label="Rewind 5 seconds"
                className="p-2.5 text-warm-600 hover:text-warm-900 hover:bg-warm-100 rounded-full transition"
                onClick={() => window.rsvpJumpSeconds?.(-5)}
              >
                <i
                  aria-hidden="true"
                  className="fa-solid fa-backward text-base"
                ></i>
              </button>
              <button
                aria-label="Play"
                aria-pressed="false"
                className="p-4 bg-warm-600 hover:bg-warm-700 text-white rounded-full shadow-lg shadow-warm-900/20 hover:scale-105 active:scale-95 transition"
                id="rsvp-play-btn"
                onClick={() => window.rsvpTogglePlay?.()}
              >
                <i
                  aria-hidden="true"
                  className="fa-solid fa-play text-lg ml-0.5"
                  id="rsvp-icon-play"
                ></i>
                <i
                  aria-hidden="true"
                  className="fa-solid fa-pause text-lg hidden"
                  id="rsvp-icon-pause"
                ></i>
              </button>
              <button
                aria-label="Forward 5 seconds"
                className="p-2.5 text-warm-600 hover:text-warm-900 hover:bg-warm-100 rounded-full transition"
                onClick={() => window.rsvpJumpSeconds?.(5)}
              >
                <i
                  aria-hidden="true"
                  className="fa-solid fa-forward text-base"
                ></i>
              </button>
            </div>

            <div className="pt-3 border-t border-warm-100">
              <div className="flex justify-between items-center mb-2.5">
                <span className="font-mono text-[10px] font-bold text-warm-500 uppercase tracking-widest">
                  Pacing
                </span>
                <span
                  className="font-outfit font-bold text-warm-800 text-sm"
                  id="rsvp-mode-label"
                >
                  Focused
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                <button
                  aria-pressed="false"
                  className="rsvp-mode-btn py-2 rounded-lg border border-warm-200 font-mono text-[9px] font-bold text-warm-500 hover:bg-warm-100 transition flex flex-col items-center gap-0.5"
                  data-mode="1"
                  onClick={() => window.rsvpSetMode?.(1)}
                >
                  <span className="font-outfit font-black text-warm-400 text-sm leading-none">
                    1
                  </span>
                  Leis.
                </button>
                <button
                  aria-pressed="false"
                  className="rsvp-mode-btn py-2 rounded-lg border border-warm-200 font-mono text-[9px] font-bold text-warm-500 hover:bg-warm-100 transition flex flex-col items-center gap-0.5"
                  data-mode="2"
                  onClick={() => window.rsvpSetMode?.(2)}
                >
                  <span className="font-outfit font-black text-warm-400 text-sm leading-none">
                    2
                  </span>
                  Comf.
                </button>
                <button
                  aria-pressed="true"
                  className="rsvp-mode-btn py-2 rounded-lg border border-warm-200 font-mono text-[9px] font-bold text-warm-500 hover:bg-warm-100 transition flex flex-col items-center gap-0.5 rsvp-mode-active"
                  data-mode="3"
                  onClick={() => window.rsvpSetMode?.(3)}
                >
                  <span className="font-outfit font-black text-sm leading-none">
                    3
                  </span>
                  Focus
                </button>
                <button
                  aria-pressed="false"
                  className="rsvp-mode-btn py-2 rounded-lg border border-warm-200 font-mono text-[9px] font-bold text-warm-500 hover:bg-warm-100 transition flex flex-col items-center gap-0.5"
                  data-mode="4"
                  onClick={() => window.rsvpSetMode?.(4)}
                >
                  <span className="font-outfit font-black text-warm-400 text-sm leading-none">
                    4
                  </span>
                  Brisk
                </button>
                <button
                  aria-pressed="false"
                  className="rsvp-mode-btn py-2 rounded-lg border border-warm-200 font-mono text-[9px] font-bold text-warm-500 hover:bg-warm-100 transition flex flex-col items-center gap-0.5"
                  data-mode="5"
                  onClick={() => window.rsvpSetMode?.(5)}
                >
                  <span className="font-outfit font-black text-warm-400 text-sm leading-none">
                    5
                  </span>
                  Sprint
                </button>
              </div>
            </div>

            <p className="hidden md:block font-mono text-[9px] text-warm-300 text-center leading-relaxed">
              Click any word in the book to jump · Words highlight as you read
            </p>

            <button
              className="hidden md:flex mt-auto font-mono text-[9px] text-warm-400 hover:text-warm-700 uppercase tracking-widest transition items-center justify-center gap-1.5 py-2 hover:bg-warm-50 rounded-lg border border-warm-100"
              onClick={() => window.exitRsvpMode?.()}
            >
              <i aria-hidden="true" className="fa-solid fa-xmark text-xs"></i>{" "}
              Exit RSVP
            </button>
          </div>

          <div
            aria-hidden="true"
            className="md:hidden flex-1 border-t border-b border-warm-200"
            id="rsvp-mini-page"
          ></div>

          <div className="md:hidden bg-white shrink-0">
            <button
              className="w-full font-mono text-[9px] text-warm-400 hover:text-warm-700 uppercase tracking-widest transition flex items-center justify-center gap-1.5 py-2 hover:bg-warm-50 rounded-lg border border-warm-100"
              onClick={() => window.exitRsvpMode?.()}
            >
              <i aria-hidden="true" className="fa-solid fa-xmark text-xs"></i>{" "}
              Exit RSVP
            </button>
          </div>
        </div>
      </div>

      <footer
        className="reader-ui bar-bg fixed bottom-0 inset-x-0 z-20 px-6 py-3 border-t backdrop-blur-md"
        id="bottom-nav"
      >
        <div className="max-w-3xl mx-auto flex flex-col gap-2">
          <div className="flex justify-between items-center font-mono text-[10px] text-warm-500 uppercase tracking-widest">
            <span id="chapter-label">…</span>
            <span className="font-bold text-orange-600" id="pct-label">
              0%
            </span>
            <span id="loc-label">…</span>
          </div>
          <div
            aria-label="Book progress"
            aria-valuemax="100"
            aria-valuemin="0"
            aria-valuenow="0"
            className="w-full h-1.5 bg-warm-200 rounded-full relative group cursor-pointer select-none touch-none"
            id="progress-track"
            role="progressbar"
          >
            <div
              className="h-full bg-orange-500 rounded-full relative transition-all duration-300"
              id="progress-fill"
              style={{ width: "0%" }}
            >
              <div
                className="absolute right-0 top-1/2 w-3 h-3 bg-white border-2 border-orange-500 rounded-full shadow-sm scale-0 group-hover:scale-100 transition-transform"
                style={{
                  transform: "translate(50%, -50%) scale(var(--tw-scale-x, 0))",
                }}
              ></div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

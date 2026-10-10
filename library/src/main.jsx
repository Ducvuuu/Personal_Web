import React from "react";
import { createRoot } from "react-dom/client";
import { LibraryApp } from "./App";
import "./library.css";

class LibraryBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main className="bg-warm-50 rounded-2xl p-8 max-w-lg">
        <h1 className="font-heavy text-xl mb-3">The library could not open</h1>
        <p className="text-warm-500 text-sm">{this.state.error.message}</p>
        <button
          className="library-primary mt-5"
          onClick={() => window.location.reload()}
        >
          Reload library
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("library-root")).render(
  <LibraryBoundary>
    <LibraryApp />
  </LibraryBoundary>,
);

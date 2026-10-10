import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve("."),
  dest = join(root, "dist");
const sections = ["about", "home", "journal", "writing", "shared"];
for (const section of sections)
  await cp(join(root, section), join(dest, section), { recursive: true });
for (const file of ["index.html", "manifest.json", "robots.txt"])
  await cp(join(root, file), join(dest, file));
for (const page of ["index.html", "reader.html"]) {
  const path = join(dest, "library", page);
  const html = await readFile(path, "utf8");
  await writeFile(
    path,
    html.replace(/\.\.\/assets\/manifest-[^"\s]+\.json/g, "../manifest.json"),
  );
}
// Reader engines remain classic scripts so RSVP retains its shared lexical state.
for (const entry of await readdir(join(root, "library"), {
  withFileTypes: true,
})) {
  if (
    ["index.html", "reader.html", "src", "index.js"].includes(entry.name) ||
    entry.name.endsWith(".md")
  )
    continue;
  await cp(
    join(root, "library", entry.name),
    join(dest, "library", entry.name),
    { recursive: true },
  );
}
await mkdir(dest, { recursive: true });
await writeFile(join(dest, ".nojekyll"), "");
console.log("Built React Library and preserved the static site.");

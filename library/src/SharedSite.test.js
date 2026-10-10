import { afterEach, describe, it, expect } from "vitest";
import source from "../../shared/components.js?raw";

afterEach(() => {
  document.body.innerHTML = "";
  delete window.PersonalSite;
});
describe("shared navigation integration", () => {
  it("preserves React host nodes while mounting navigation and footer repeatedly", () => {
    document.body.innerHTML =
      '<main><div id="site-nav"></div><div id="site-footer"></div></main>';
    const nav = document.getElementById("site-nav"),
      footer = document.getElementById("site-footer");
    window.eval(source);
    window.PersonalSite.mount(document.querySelector("main"), true);
    window.PersonalSite.mount(document.querySelector("main"), true);
    expect(document.getElementById("site-nav")).toBe(nav);
    expect(document.getElementById("site-footer")).toBe(footer);
    expect(nav.querySelectorAll("nav")).toHaveLength(1);
    expect(nav.textContent).toContain("Library");
    expect(footer.textContent).toContain("The Door's Open");
  });
  it("keeps the original static-page placeholder replacement", () => {
    document.body.innerHTML =
      '<div id="site-nav"></div><div id="site-footer"></div>';
    window.eval(source);
    window.PersonalSite.mount();
    expect(document.getElementById("site-nav")).toBeNull();
    expect(document.getElementById("site-footer")).toBeNull();
    expect(document.querySelector("nav")).not.toBeNull();
    expect(document.body.textContent).toContain("The Door's Open");
  });
});

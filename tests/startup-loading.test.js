const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const templatePath = path.join(
  root,
  "live_ws",
  "templates",
  "game",
  "index.html"
);

describe("application startup gate", () => {
  let html;
  let menuSource;
  let styleSource;
  let utilsSource;

  beforeAll(() => {
    html = fs.readFileSync(templatePath, "utf8");
    menuSource = fs.readFileSync(path.join(root, "static", "classes", "menu.js"), "utf8");
    styleSource = fs.readFileSync(path.join(root, "static", "style.css"), "utf8");
    utilsSource = fs.readFileSync(path.join(root, "static", "classes", "utils.js"), "utf8");
  });

  test("shows a loader while the menu and Start button are unavailable", () => {
    expect(html).toMatch(/id="app_loading_panel"/);
    expect(html).toMatch(/id="main_pannnel" style="display: none"/);
    expect(html).toMatch(/id="startGameBtn"[\s\S]*?disabled/);
  });

  test("keeps the overlay pinned to every viewport edge while the game scrolls", () => {
    const overlayRule = styleSource.match(/\.overlay\s*\{([^}]+)\}/);

    expect(overlayRule).not.toBeNull();
    expect(overlayRule[1]).toMatch(/position:\s*fixed/);
    for (const edge of ["top", "right", "bottom", "left"]) {
      expect(overlayRule[1]).toMatch(new RegExp(`${edge}:\\s*0`));
    }
    expect(overlayRule[1]).toMatch(/overflow:\s*auto/);
  });

  test("marks the app ready only after the final chess dependency", () => {
    const finalDependency = html.indexOf(
      'src="static/classes/pieces/queen.js"'
    );
    const readyCall = html.indexOf("window.markChessAppReady();");

    expect(finalDependency).toBeGreaterThan(-1);
    expect(readyCall).toBeGreaterThan(finalDependency);
  });

  test("attempts to restore an active online session on load", () => {
    expect(menuSource).toContain("window.resumeOnlineConnectionOnLoad();");
    expect(menuSource).toContain('"chess-online-active-session"');
    expect(menuSource).toContain("resume_only: !!onlineConnection.resumeOnly");
  });

  test("allows authoritative server clock values to replace local timer state", () => {
    expect(utilsSource).toContain("obj.setRemainingMs = function");
    expect(menuSource).toContain("applyServerClock(data.clock)");
  });
});

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const templatePath = path.join(root, "live_ws", "templates", "game", "index.html");
const outputIndexPath = path.join(root, "index.html");
const outputNoJekyllPath = path.join(root, ".nojekyll");

function buildStaticHtml(template) {
  let html = template
    // GitHub Pages project sites are usually hosted below /repo-name/, so all
    // local assets must stay relative to index.html instead of starting at /.
    .replace(/href="\/static\//g, 'href="static/')
    .replace(/src="\/static\//g, 'src="static/')
    // Replace Django-only template variables with deterministic frontend values.
    .replace(/"\{\{\s*MY_USER_ID\s*\}\}"/g, '"static-export-user"')
    .replace(/Number\("\{\{\s*server_time\s*\}\}"\)/g, "Date.now()")
    .replace(/\{\{\s*MY_USER_ID\s*\}\}/g, "static-export-user")
    .replace(/\{\{\s*server_time\s*\}\}/g, String(Date.now()));

  html = html.replace(
    /<input([\s\S]*?)name="mode_of_play"([\s\S]*?)value="online"([\s\S]*?)checked([\s\S]*?)\/>/,
    '<input$1name="mode_of_play"$2value="online"$3disabled$4/>'
  );

  html = html.replace(
    /<input type="radio" name="mode_of_play" value="offline" \/>/,
    '<input type="radio" name="mode_of_play" value="offline" checked />'
  );

  html = html.replace(
    /<label class="btn btn-outline-success active">/,
    '<label class="btn btn-outline-success disabled" aria-disabled="true" title="Online mode requires the Django/WebSocket backend">'
  );

  html = html.replace(
    /<label class="btn btn-outline-dark">/,
    '<label class="btn btn-outline-dark active">'
  );

  html = html.replace(
    /<script>\s*const MY_USER_ID = "static-export-user";([\s\S]*?)window\.priority = Date\.now\(\);([\s\S]*?)<\/script>/,
    `<script>
      window.STATIC_EXPORT = true;
      const MY_USER_ID = "static-export-user";
      // Static exports do not have Django server timestamps or WebSockets.
      window.priority = Date.now();
    </script>`
  );

  if (/\{%|\{\{/.test(html)) {
    throw new Error("Export still contains Django template syntax.");
  }

  if (/\b(?:href|src)="\/static\//.test(html)) {
    throw new Error("Export still contains root-relative /static/ asset paths.");
  }

  return html;
}

function main() {
  const template = fs.readFileSync(templatePath, "utf8");
  const html = buildStaticHtml(template);

  fs.writeFileSync(outputIndexPath, html);
  fs.writeFileSync(outputNoJekyllPath, "");

  console.log("Static GitHub Pages export written to repository root.");
  console.log("Generated: index.html, .nojekyll; assets served from existing static/.");
}

if (require.main === module) {
  main();
}

module.exports = { buildStaticHtml };
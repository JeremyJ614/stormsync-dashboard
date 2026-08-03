#!/usr/bin/env node
import fs from "node:fs";

const path = "package.json";
let content = fs.readFileSync(path, "utf8");

const from = `    "leaflet": "^1.9.4",`;
const to = `    "leaflet": "^1.9.4",\n    "maplibre-gl": "^4.7.1",`;

if (content.includes("maplibre-gl")) {
  console.log("OK: maplibre-gl already in package.json, nothing to do");
} else if (!content.includes(from)) {
  console.error("x SKIPPED: couldn't find the expected leaflet line in package.json.");
  process.exit(1);
} else {
  content = content.replace(from, to);
  fs.writeFileSync(path, content, "utf8");
  console.log("OK: added maplibre-gl to package.json");
}

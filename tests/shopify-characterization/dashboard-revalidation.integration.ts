import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/routes/app._index.tsx", "utf8");
const hero = fs.readFileSync("app/components/dashboard/DashboardHero.tsx", "utf8");

assert.match(route, /useRevalidator/);
assert.equal((route.match(/revalidator\.revalidate\(\)/g) ?? []).length, 1);
assert.match(route, /revalidator\.state !== "idle"/);
assert.match(route, /currentPeriodHasSales \? "complete" : "empty"/);
assert.match(route, /\.catch\(\(\) =>/);

assert.match(hero, /onClick=\{onRunAnalysis\}/);
assert.match(hero, /disabled=\{analysisLoading\}/);
assert.match(hero, /disabled: analysisLoading/);
assert.match(hero, /aria-live="polite"/);
assert.doesNotMatch(hero, /setInterval|setTimeout/);

console.log("Dashboard revalidation checks passed.");

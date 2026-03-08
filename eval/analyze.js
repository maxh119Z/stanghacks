#!/usr/bin/env node
/**
 * Think - Eval Analysis
 *
 * After you manually fill in the "Given Score" column in validation_dataset.csv,
 * run this to get accuracy stats.
 *
 * Usage: node analyze.js
 *
 * Scoring: Low=1, Medium=2, High=3
 * "Exact" = same score. "Close" = within 1 level.
 */

const fs = require("fs");
const path = require("path");

const csv = fs.readFileSync(path.join(__dirname, "validation_dataset.csv"), "utf8");
const lines = csv.trim().split(/\r?\n/);

function parseCsvLine(line) {
  const vals = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      vals.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  vals.push(current.trim());
  return vals;
}

const headers = parseCsvLine(lines[0]).map((h) => h.trim());

function getColIndex(name) {
  return headers.indexOf(name);
}

const idx = {
  text: getColIndex("Question"),
  hasImage: getColIndex("Image"),
  expected: getColIndex("Expected Score"),
  given: getColIndex("Given Score"),
  className: getColIndex("Class"),
};

const requiredColumns = ["Question", "Image", "Expected Score", "Given Score", "Class"];
const missingColumns = requiredColumns.filter((col) => getColIndex(col) === -1);

if (missingColumns.length > 0) {
  console.error(`Missing required column(s): ${missingColumns.join(", ")}`);
  console.error(`Found headers: ${headers.join(", ")}`);
  process.exit(1);
}

function parseHasImage(value) {
  const v = (value || "").trim().toLowerCase();
  if (!v) return false;
  return !["no", "false", "0", "none", "null", "n/a"].includes(v);
}

function parseScore(value) {
  const v = String(value || "").trim().toLowerCase();

  if (!v) return 0;
  if (v === "1" || v === "low") return 1;
  if (v === "2" || v === "medium" || v === "med") return 2;
  if (v === "3" || v === "high") return 3;

  return 0;
}

function computeCohenKappa(subset) {
  const n = subset.length;
  if (n === 0) return null;

  // 3x3 confusion matrix, index 0 unused
  const matrix = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (const r of subset) {
    if (r.expected >= 1 && r.expected <= 3 && r.given >= 1 && r.given <= 3) {
      matrix[r.expected][r.given]++;
    }
  }

  let observed = 0;
  const rowTotals = [0, 0, 0, 0];
  const colTotals = [0, 0, 0, 0];

  for (let i = 1; i <= 3; i++) {
    for (let j = 1; j <= 3; j++) {
      const count = matrix[i][j];
      rowTotals[i] += count;
      colTotals[j] += count;
      if (i === j) observed += count;
    }
  }

  const p0 = observed / n;

  let pe = 0;
  for (let k = 1; k <= 3; k++) {
    pe += (rowTotals[k] / n) * (colTotals[k] / n);
  }

  if (pe === 1) return 1;
  return (p0 - pe) / (1 - pe);
}

function formatKappa(kappa) {
  if (kappa === null || Number.isNaN(kappa)) return "N/A";
  return kappa.toFixed(4);
}

const rows = lines.slice(1).map((line, i) => {
  const vals = parseCsvLine(line);

  return {
    rowNum: i + 2,
    text: vals[idx.text] || "",
    hasImage: parseHasImage(vals[idx.hasImage]),
    expected: parseScore(vals[idx.expected]),
    given: parseScore(vals[idx.given]),
    className: vals[idx.className] || "",
  };
});

const scored = rows.filter((r) => r.given > 0 && r.expected > 0);
const unscored = rows.filter((r) => !r.given || r.given === 0);

if (scored.length === 0) {
  console.log("No scored rows found. Fill in the 'Given Score' column in validation_dataset.csv first.");
  console.log(`(${unscored.length} rows waiting to be scored)`);
  process.exit(0);
}

function analyze(subset, label) {
  if (subset.length === 0) return;

  let exact = 0;
  let close = 0;
  let totalDiff = 0;
  const diffs = { under: 0, exact: 0, over: 0 };
  const confMatrix = {};
  const kappa = computeCohenKappa(subset);

  subset.forEach((r) => {
    const diff = r.given - r.expected;
    totalDiff += Math.abs(diff);

    if (diff === 0) {
      exact++;
      close++;
      diffs.exact++;
    } else if (Math.abs(diff) === 1) {
      close++;
      diff < 0 ? diffs.under++ : diffs.over++;
    } else {
      diff < 0 ? diffs.under++ : diffs.over++;
    }

    const key = `${r.expected}->${r.given}`;
    confMatrix[key] = (confMatrix[key] || 0) + 1;
  });

  const n = subset.length;
  const avgDiff = (totalDiff / n).toFixed(2);

  console.log(`\n  ${label} (n=${n})`);
  console.log(`  ${"─".repeat(40)}`);
  console.log(`  Exact match:    ${exact}/${n} = ${pct(exact, n)}%`);
  console.log(`  Within 1 level: ${close}/${n} = ${pct(close, n)}%`);
  console.log(`  Avg |diff|:     ${avgDiff}`);
  console.log(`  Cohen's kappa:  ${formatKappa(kappa)}`);
  console.log(`  Under-flagged:  ${diffs.under}  (Think said lower risk than expected)`);
  console.log(`  Over-flagged:   ${diffs.over}  (Think said higher risk than expected)`);

  const pairs = Object.entries(confMatrix).sort((a, b) => b[1] - a[1]);
  if (pairs.length > 0) {
    console.log(`  Confusion (expected->given):`);
    pairs.forEach(([k, v]) => {
      const [from, to] = k.split("->");
      const fromLabel = ["", "Low", "Med", "High"][parseInt(from, 10)];
      const toLabel = ["", "Low", "Med", "High"][parseInt(to, 10)];
      const marker = from === to ? " ✓" : "";
      console.log(`    ${fromLabel} -> ${toLabel}: ${v}${marker}`);
    });
  }
}

function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

console.log("╔══════════════════════════════════════════╗");
console.log("║     Think - Eval Analysis                ║");
console.log("╚══════════════════════════════════════════╝");
console.log(`Total rows: ${rows.length} | Scored: ${scored.length} | Unscored: ${unscored.length}`);

analyze(scored, "OVERALL");

const withImage = scored.filter((r) => r.hasImage);
const withoutImage = scored.filter((r) => !r.hasImage);
analyze(withImage, "WITH IMAGE");
analyze(withoutImage, "TEXT ONLY");

const classes = [...new Set(scored.map((r) => r.className).filter(Boolean))];
classes.forEach((cls) => {
  analyze(scored.filter((r) => r.className === cls), `CLASS: ${cls}`);
});

console.log("\n═══════════════════════════════════════════");
console.log("SAFETY ANALYSIS");
console.log("═══════════════════════════════════════════");

const dangerousMisses = scored.filter((r) => r.expected === 3 && r.given === 1);
console.log(`\nDangerous misses (expected High, got Low): ${dangerousMisses.length}`);
dangerousMisses.forEach((r) =>
  console.log(`  row ${r.rowNum}: "${r.text.slice(0, 60)}..." [${r.className}]`)
);

const falseFlags = scored.filter((r) => r.expected === 1 && r.given === 3);
console.log(`\nFalse flags (expected Low, got High): ${falseFlags.length}`);
falseFlags.forEach((r) =>
  console.log(`  row ${r.rowNum}: "${r.text.slice(0, 60)}..." [${r.className}]`)
);

const unnecessary = scored.filter((r) => r.expected === 1 && r.given >= 2);
console.log(`\nUnnecessary friction (expected Low, got Med+): ${unnecessary.length}`);
unnecessary.forEach((r) =>
  console.log(`  row ${r.rowNum}: "${r.text.slice(0, 60)}..." [${r.className}]`)
);

const missed = scored.filter((r) => r.expected === 3 && r.given <= 2);
console.log(`\nMissed catches (expected High, got Med-): ${missed.length}`);
missed.forEach((r) =>
  console.log(`  row ${r.rowNum}: "${r.text.slice(0, 60)}..." [${r.className}]`)
);

console.log("\n" + "─".repeat(50));

if (unscored.length > 0) {
  console.log(`\n${unscored.length} rows still need scoring. Fill in the 'Given Score' column.`);
  unscored.forEach((r) => console.log(`  row ${r.rowNum}: "${r.text.slice(0, 50)}..."`));
}

const summary = {
  timestamp: new Date().toISOString(),
  total: scored.length,
  overall: {
    exact: scored.filter((r) => r.given === r.expected).length,
    close: scored.filter((r) => Math.abs(r.given - r.expected) <= 1).length,
    cohenKappa: computeCohenKappa(scored),
  },
  withImage: {
    n: withImage.length,
    exact: withImage.filter((r) => r.given === r.expected).length,
    cohenKappa: computeCohenKappa(withImage),
  },
  textOnly: {
    n: withoutImage.length,
    exact: withoutImage.filter((r) => r.given === r.expected).length,
    cohenKappa: computeCohenKappa(withoutImage),
  },
  dangerousMisses: dangerousMisses.length,
  falseFlags: falseFlags.length,
};

fs.writeFileSync(
  path.join(__dirname, "analysis.json"),
  JSON.stringify(summary, null, 2)
);

console.log("\nSaved to analysis.json");
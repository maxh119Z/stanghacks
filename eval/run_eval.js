#!/usr/bin/env node
/**
 * Think — Validation Eval Script
 * 
 * Usage:
 *   node run_eval.js YOUR_OPENAI_API_KEY
 * 
 * Or set env variable:
 *   OPENAI_API_KEY=sk-... node run_eval.js
 * 
 * Skips image prompts unless the image file exists in eval/images/
 * (for the demo, just snap a few photos and drop them in there)
 */

const fs = require("fs");
const path = require("path");

const API_KEY = process.argv[2] || process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error("Usage: node run_eval.js YOUR_OPENAI_API_KEY");
  process.exit(1);
}

const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, "dataset.json"), "utf8"));
const profile = dataset.profile;

// ── System prompt (same as background.js) ─────────────────────

function buildSystemPrompt() {
  const classes = profile.classes.join(", ");
  const difficulty = profile.difficulty;
  let dynamicCtx = "";
  if (profile.dynamicKnowledge && Object.keys(profile.dynamicKnowledge).length > 0) {
    dynamicCtx = "\nDYNAMIC KNOWLEDGE:\n" +
      Object.entries(profile.dynamicKnowledge).map(([subj, d]) =>
        `  - ${subj}: ${d.promptCount} prompts (${d.topics.join(", ")})`
      ).join("\n") + "\n";
  }
  return `You are Think, a cognitive dependency classifier. Evaluate whether a student's AI prompt is something they should try solving themselves.

STUDENT PROFILE:
- Level: ${difficulty}
- Classes: ${classes}
${dynamicCtx}
EVALUATE:
1. intent_category: "direct_answer"|"homework_completion"|"concept_clarification"|"brainstorming"|"editing_polishing"|"advanced_help"|"casual_chat"
2. outsourcing_risk: "low"|"medium"|"high"
3. confidence: 0-1
4. subject: e.g. "calculus","english","biology","computer_science","general"
5. recommended_intervention: "allow"|"hint"|"nudge"|"cooldown"
6. message: Brief, friendly, non-preachy (1-2 sentences).
7. hint: If intervention != allow, give a starting point. Otherwise null.
8. profile_update: If specific topic revealed: {"topic":"..."}. Otherwise null.

Consider classes when judging. Calculus student asking basic algebra = high risk.

RESPOND ONLY JSON:
{"intent_category":"...","outsourcing_risk":"...","confidence":0.85,"subject":"...","recommended_intervention":"...","message":"...","hint":null,"profile_update":null}`;
}

// ── Classify a single prompt ──────────────────────────────────

async function classify(text, imagePath) {
  const userContent = [];

  // Add image if exists
  if (imagePath) {
    const fullPath = path.join(__dirname, "images", imagePath);
    if (fs.existsSync(fullPath)) {
      const base64 = fs.readFileSync(fullPath).toString("base64");
      const ext = path.extname(imagePath).slice(1);
      const mime = ext === "png" ? "image/png" : "image/jpeg";
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${base64}`, detail: "low" },
      });
      userContent.push({ type: "text", text: `[Prompt with image]:\n${text}` });
    } else {
      console.log(`    [SKIP IMAGE] ${imagePath} not found — classifying text only`);
      userContent.push({ type: "text", text });
    }
  } else {
    userContent.push({ type: "text", text });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err.error?.message || "Unknown"}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned);
}

// ── Scoring helpers ───────────────────────────────────────────

// Risk ordering for "close enough" scoring
const RISK_ORDER = { low: 0, medium: 1, high: 2 };
const INTERVENTION_ORDER = { allow: 0, hint: 1, nudge: 2, cooldown: 3 };

function riskClose(expected, actual) {
  return Math.abs((RISK_ORDER[expected] || 0) - (RISK_ORDER[actual] || 0)) <= 1;
}
function interventionClose(expected, actual) {
  return Math.abs((INTERVENTION_ORDER[expected] || 0) - (INTERVENTION_ORDER[actual] || 0)) <= 1;
}

// ── Run ───────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     Think — Validation Eval Suite        ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`Profile: ${profile.classes.join(", ")} [${profile.difficulty}]`);
  console.log(`Prompts: ${dataset.prompts.length}`);
  console.log("─".repeat(50));

  const results = [];
  let categoryExact = 0, riskExact = 0, riskCloseCount = 0;
  let interventionExact = 0, interventionCloseCount = 0;
  let total = 0;

  for (const prompt of dataset.prompts) {
    process.stdout.write(`  #${prompt.id.toString().padStart(2)} `);

    try {
      // Rate limit: wait 500ms between calls
      if (total > 0) await new Promise((r) => setTimeout(r, 500));

      const result = await classify(prompt.text, prompt.image);
      total++;

      const catMatch = result.intent_category === prompt.expected_category;
      const riskMatch = result.outsourcing_risk === prompt.expected_risk;
      const riskNear = riskClose(prompt.expected_risk, result.outsourcing_risk);
      const intMatch = result.recommended_intervention === prompt.expected_intervention;
      const intNear = interventionClose(prompt.expected_intervention, result.recommended_intervention);

      if (catMatch) categoryExact++;
      if (riskMatch) riskExact++;
      if (riskNear) riskCloseCount++;
      if (intMatch) interventionExact++;
      if (intNear) interventionCloseCount++;

      const status = (catMatch && riskMatch) ? "PASS" : (catMatch && riskNear) ? "NEAR" : "MISS";
      const marker = status === "PASS" ? "+" : status === "NEAR" ? "~" : "X";

      console.log(
        `[${marker}] "${prompt.text.slice(0, 50)}${prompt.text.length > 50 ? "..." : ""}"` +
        `${prompt.image ? " [IMG]" : ""}` +
        `\n       Expected: ${prompt.expected_category} / ${prompt.expected_risk} / ${prompt.expected_intervention}` +
        `\n       Got:      ${result.intent_category} / ${result.outsourcing_risk} / ${result.recommended_intervention}`
      );

      results.push({ id: prompt.id, status, expected: prompt, actual: result });
    } catch (e) {
      console.log(`[!] ERROR: ${e.message}`);
      results.push({ id: prompt.id, status: "ERROR", error: e.message });
    }
  }

  // ── Summary ──
  console.log("\n" + "═".repeat(50));
  console.log("RESULTS SUMMARY");
  console.log("═".repeat(50));
  console.log(`Total evaluated:       ${total}`);
  console.log("");
  console.log(`Category (exact):      ${categoryExact}/${total} = ${pct(categoryExact, total)}%`);
  console.log(`Risk (exact):          ${riskExact}/${total} = ${pct(riskExact, total)}%`);
  console.log(`Risk (within 1):       ${riskCloseCount}/${total} = ${pct(riskCloseCount, total)}%`);
  console.log(`Intervention (exact):  ${interventionExact}/${total} = ${pct(interventionExact, total)}%`);
  console.log(`Intervention (within 1): ${interventionCloseCount}/${total} = ${pct(interventionCloseCount, total)}%`);
  console.log("");

  // The key metric for the demo
  const safetyScore = results.filter(
    (r) => r.status !== "ERROR" && (r.actual?.outsourcing_risk !== "low" || r.expected?.expected_risk === "low")
  ).length;
  console.log(`Safety (correctly flags risky OR correctly allows safe): ${safetyScore}/${total} = ${pct(safetyScore, total)}%`);

  console.log("\n─".repeat(50));
  console.log("Misses:");
  results.filter((r) => r.status === "MISS").forEach((r) => {
    console.log(`  #${r.id}: expected ${r.expected.expected_category}/${r.expected.expected_risk} got ${r.actual.intent_category}/${r.actual.outsourcing_risk}`);
  });

  // Write results to file
  fs.writeFileSync(
    path.join(__dirname, "results.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), total, categoryExact, riskExact, riskCloseCount, interventionExact, interventionCloseCount, details: results }, null, 2)
  );
  console.log("\nFull results saved to eval/results.json");
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

main().catch(console.error);

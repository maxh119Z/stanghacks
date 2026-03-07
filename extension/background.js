// BrainGuard Background Service Worker
// Handles prompt classification via OpenAI API

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CLASSIFY_PROMPT") {
    handleClassification(message.prompt).then(sendResponse);
    return true; // Keep channel open for async response
  }
});

async function handleClassification(promptText) {
  // Get settings
  const data = await chrome.storage.sync.get([
    "apiKey",
    "classes",
    "difficulty",
    "enabled",
  ]);

  if (data.enabled === false) {
    return { error: "BrainGuard is disabled" };
  }

  if (!data.apiKey) {
    return { error: "No API key set. Click the BrainGuard extension icon to add one." };
  }

  const classes = data.classes || "General knowledge";
  const difficulty = data.difficulty || "high_school";

  const systemPrompt = buildSystemPrompt(classes, difficulty);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: promptText },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        error: `API error: ${response.status} - ${err.error?.message || "Unknown error"}`,
      };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    return parseClassification(content);
  } catch (err) {
    return { error: `Network error: ${err.message}` };
  }
}

function buildSystemPrompt(classes, difficulty) {
  return `You are BrainGuard, a cognitive dependency classifier. Your job is to evaluate whether a student's AI prompt is something they should try solving themselves first.

STUDENT PROFILE:
- Level: ${difficulty}
- Current classes: ${classes}

CLASSIFICATION CATEGORIES:
1. direct_answer - Student is asking for a direct answer they could figure out (e.g., "What is 2+2?", "What year was the Declaration of Independence signed?")
2. homework_completion - Student wants AI to do their homework/assignment (e.g., "Write me an essay about...", "Solve problems 1-10")  
3. concept_clarification - Student wants to understand a concept better (e.g., "Explain how photosynthesis works", "What's the difference between mitosis and meiosis?")
4. brainstorming - Student is looking for ideas or creative direction (e.g., "What are some topics I could write about?")
5. editing_polishing - Student wants help improving their own work (e.g., "Can you proofread this?", "How can I make this essay stronger?")
6. advanced_help - Genuinely complex problem that benefits from AI (e.g., debugging code, complex research synthesis)
7. casual_chat - Not academic, just chatting

DEPENDENCY LEVEL (1-5):
1 = Totally fine, good use of AI (concept clarification, brainstorming, advanced problems)
2 = Acceptable, but could try first (editing, complex questions)  
3 = Borderline - student should attempt first (moderate homework help)
4 = Likely too dependent - this is solvable with effort (direct answers, simple homework)
5 = Definitely do this yourself (trivial questions, basic homework completion)

Consider the student's classes when judging. A calculus student asking about basic algebra = level 5. A student in intro biology asking about advanced genetics = level 1.

RESPOND IN EXACTLY THIS JSON FORMAT, nothing else:
{
  "category": "one_of_the_categories",
  "level": 3,
  "message": "A brief, friendly, non-preachy message (1-2 sentences max). Be encouraging, not condescending. Think supportive coach, not nagging parent.",
  "hint": "If level >= 3, give a brief hint or starting point to help them solve it themselves. Otherwise null."
}`;
}

function parseClassification(content) {
  try {
    // Strip markdown code fences if present
    const cleaned = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    return {
      category: parsed.category || "casual_chat",
      level: Math.min(5, Math.max(1, parseInt(parsed.level) || 1)),
      message: parsed.message || "Thinking about this one...",
      hint: parsed.hint || null,
    };
  } catch (e) {
    console.error("[BrainGuard] Failed to parse classification:", content);
    // Fail open
    return {
      category: "unknown",
      level: 1,
      message: "Couldn't classify this one — sending through!",
      hint: null,
    };
  }
}

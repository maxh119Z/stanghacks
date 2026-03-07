# Eval — Validation Dataset

Tests Think's classifier against 25 labeled prompts and reports accuracy.

## Quick Run

```bash
cd eval
node run_eval.js YOUR_OPENAI_API_KEY
```

Or:
```bash
export OPENAI_API_KEY=sk-...
node run_eval.js
```

## Adding Test Images

The dataset includes 3 image-based prompts (#16, #17, #18). Take photos and save them to `eval/images/`:

- `calc_homework.jpg` — photo of a math worksheet or textbook problems
- `physics_diagram.jpg` — any physics/science diagram from a textbook
- `essay_prompt.jpg` — photo of an essay assignment or writing prompt

If the image files aren't there, the script skips the image and classifies text-only (with a warning).

## What It Measures

| Metric | What it means |
|--------|--------------|
| Category (exact) | Did it get the intent right? (direct_answer vs homework_completion etc.) |
| Risk (exact) | Did it get low/medium/high right? |
| Risk (within 1) | Was it at most one level off? (medium when expected high = close enough) |
| Intervention (exact) | Did it recommend the right action? |
| Intervention (within 1) | Was it at most one step off? |
| Safety | Does it correctly flag risky prompts AND correctly allow safe ones? |

## Output

Prints a summary table to console and saves detailed results to `eval/results.json`.

## For the Demo

Run it live. Say something like:

> "We tested our classifier against 25 labeled prompts spanning homework completion, concept clarification, brainstorming, and image-based questions. It correctly identified the outsourcing risk within one level on X% of prompts, and correctly flagged or allowed on Y%."

The "within 1" metrics are your friends — exact match on a 3-point or 4-point scale is hard, but being within one level is what actually matters for the user experience.

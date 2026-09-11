# About This Project — Blast Radius Predictor

## What this is

**Blast Radius Predictor** is a Gemini-powered web app that reads a raw, messy code change (a PR diff) and tells you — before you ship it — exactly which other services or teams it's likely to break, why, and whether it matches a past incident.

It was built for the **PromptWars x Techverse** hackathon (Google for Developers / Build with AI challenge), whose brief was:

> Build a Gemini-powered app that solves a societal or organizational benefit by acting as a universal bridge between human intent and complex systems — taking unstructured, messy, real-world input and instantly converting it into structured, verified, life-saving/critical action.

This project applies that pattern to software engineering: the messy input is a code diff, and the structured, verified output is a risk report that can prevent a production outage.

---

## The real-life problem it solves

In almost every engineering organization, when someone changes one service's code, **nobody has a clear, reliable picture of what else will break.** That information exists, but it's scattered and disconnected:

- **Dependency information** lives buried in code, config files, or in the heads of a few senior engineers — not written down anywhere central.
- **Past incident history** — the fact that a similar change caused an outage six months ago — sits in an old postmortem doc nobody rereads before making a similar change again.
- **Connecting the dots** between "this new change" and "that old incident" currently requires a human to manually remember, search, and reason about it — under time pressure, right before a deploy.

The result is a well-known, expensive, and preventable failure mode in tech: **avoidable production incidents caused by changes whose downstream impact was knowable, but not visible at the moment someone hit "merge" or "deploy."**

This app closes that gap. It doesn't just tell you "here's a risk" in the abstract — it gives you a structured, evidence-backed answer: *this specific service will likely break, for this specific reason, and here's the exact past incident that proves it.*

---

## How it works, end to end

### 1. The mock company (`mock-data/`)
For demo purposes, the app operates on a small fictional microservices company:

- **5 services:** `auth-service`, `payment-service`, `inventory-service`, `order-service`, `notification-service`
- **Realistic dependencies** between them (e.g. `order-service` depends on `payment-service`, `inventory-service`, and `notification-service`)
- **4 past incident postmortems** — realistic-sounding writeups of real outages that happened because of specific code changes (e.g. "payment schema change broke order creation")

This stands in for what, in a real deployment, would be extracted automatically from a company's actual repos, configs, and incident tracker.

### 2. The dependency graph (`backend/src/services/graphBuilder.js`)
This reads the mock service configs and builds an actual graph data structure of "who depends on whom." When you say "I'm changing `payment-service`," it runs a breadth-first search over that graph to compute the **blast radius** — every service, direct or transitive, that could be affected by a change to it.

### 3. The AI reasoning (`backend/src/services/geminiService.js`)
This is the core AI-powered step. It sends Gemini:
- The actual diff text
- The list of downstream services in the blast radius
- Any past incidents that specifically involved the service being changed

...and asks it to reason, in plain English, about whether *this specific change* is likely to break each downstream service — citing a matching past incident by ID if the pattern matches. This is why the app can say something like:

> "The code diff renames the response field 'transactionId' to 'txnRef' in the /charge route. This exact breaking schema change pattern directly mirrors INC-101, where order-service failed because it relied on the 'transactionId' field, resulting in null reference errors on every checkout."

That's Gemini actually reading and reasoning over the code, not a canned template.

### 4. The safety net (`backend/src/services/mockPredictor.js`)
Gemini's API can occasionally be temporarily overloaded (this happened during testing — a transient `503 Service Unavailable`). To keep the app usable even then, there's an automatic two-layer fallback:
- First, the backend **retries the Gemini call up to 3 times** with increasing delays (1s, then 2s) to ride out short blips.
- If it still fails, a **rule-based backup predictor** kicks in, using hop-distance and incident history to produce a reasonable (if less nuanced) risk assessment, so the app never just shows a broken error state.

### 5. The frontend (`frontend/index.html`, `app.js`, `style.css`)
A single-page dashboard:
- Renders the dependency graph as an SVG, with nodes laid out by dependency depth
- Lets you paste a diff (or load one of two built-in samples — one risky, one safe)
- Sends it to the backend and displays the structured result: overall risk level, and one card per affected service with its specific reasoning and any related incident ID
- Colors the graph nodes by risk level once a prediction comes back

---

## How to use it

**Live app:** https://nithish-promptwar.onrender.com

1. Open the link. (Note: it's on Render's free tier, which sleeps after inactivity — the first load after a period of no traffic can take 30–60 seconds to wake up.)
2. Either:
   - Click **"Load risky sample"** or **"Load safe sample"** to try a pre-built example, or
   - Paste your own diff into the text box — it must mention one of the five known service names somewhere in the file path or code so the app knows which service is being changed.
3. Click **"Predict blast radius."**
4. Read the result:
   - The top banner shows the **overall risk level** (low / medium / high / critical) for the change.
   - Below it, one card per affected downstream service explains **why** it's at risk, with a link to the matching past incident (e.g. `INC-101`) if one applies.
   - The dependency graph on the left lights up the affected node in the matching risk color.

**Running it locally (for development):**
```bash
cd backend
npm install
cp .env.example .env
# add your own Gemini API key to .env (from https://aistudio.google.com/apikey)
npm start
```
Then open `http://localhost:4000` — the backend also serves the frontend directly.

---

## Tech stack

- **Backend:** Node.js + Express
- **AI:** Google Gemini API (`gemini-flash-lite-latest`), called via the official `@google/generative-ai` SDK
- **Frontend:** Vanilla HTML/CSS/JavaScript, SVG for the graph visualization (no framework — kept deliberately simple and fast)
- **Hosting:** Render (free tier)
- **Data:** Static JSON mock data standing in for a real company's service configs and incident history

---

## Known limitations (and what a production version would add)

This was built as a hackathon proof of concept, so some things are intentionally simplified:

- **The dependency graph is mock data**, not extracted from real code. A production version would use Gemini to parse actual repos, Dockerfiles, and API call graphs to build this automatically.
- **Incident history is static and hand-written.** A real version would ingest actual postmortem documents (e.g. from Confluence, Notion, or an incident-management tool) and keep growing that history automatically.
- **Diffs are pasted manually.** A real integration would hook into GitHub/GitLab webhooks so this analysis runs automatically on every pull request, commenting the risk report directly on the PR.
- **Service identification is a simple text-match heuristic** (it looks for a known service name inside the diff text). A production version would use the PR's actual file paths and repo metadata instead.

These are the natural "what's next" points if asked about extending the project beyond the hackathon.

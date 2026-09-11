# Blast Radius Predictor

**Cross-Team Dependency & Blast-Radius Predictor** — built for the PromptWars x Techverse hackathon (Google for Developers / Build with AI challenge).

## The problem

When an engineer changes a service, they usually have no clear picture of what else will break. Dependency information lives scattered across code, config files, Slack messages, and tribal knowledge — messy, unstructured, and easy to miss. The result: preventable production incidents.

## What this does

Paste a PR diff → the app identifies which service it touches → builds a live dependency graph from service configs → asks Gemini to reason over the diff, the graph, and past incident postmortems → returns a structured, plain-English risk prediction for every downstream service, citing similar past incidents where relevant.

This turns "messy, unstructured change" into "structured, verified, actionable risk report" — before the change ships, not after it breaks something.

## Architecture

```
frontend (vanilla HTML/CSS/JS)
   │  paste diff, view graph + risk report
   ▼
backend (Node/Express)
   ├── graphBuilder.js   → builds dependency graph from mock-data/services.json
   │                        computes blast radius (BFS over "who depends on this")
   ├── geminiService.js  → sends diff + graph + relevant incidents to Gemini,
   │                        gets back structured JSON risk assessment
   └── mockPredictor.js  → rule-based fallback if Gemini call fails,
                            so the demo never dies mid-presentation
```

Mock data (`mock-data/`) simulates 5 microservices (auth, payment, inventory, order, notification) with realistic dependencies, plus 4 past incident postmortems used as grounding evidence for Gemini's reasoning.

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env and add your Gemini API key (get one at https://aistudio.google.com/apikey)
npm start
```

Server runs on `http://localhost:4000` and also serves the frontend.

### 2. Open the app

Visit `http://localhost:4000` in your browser.

### 3. Try the demo

- Click **"Load risky sample"** → analyzes a diff that renames a payment API field (matches a real past incident, INC-101) → expect **high risk** on `order-service`.
- Click **"Load safe sample"** → analyzes a logging-only change to notifications → expect **low risk**.
- Or paste your own diff — just make sure a known service name (`auth-service`, `payment-service`, `inventory-service`, `order-service`, `notification-service`) appears somewhere in the file path or code.

If no `GEMINI_API_KEY` is set, the app automatically falls back to a rule-based predictor so it still works for local testing — the UI will label results as "offline fallback mode."

## Project structure

```
blast-radius-predictor/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── routes/
│   │   │   ├── graph.js
│   │   │   └── predict.js
│   │   └── services/
│   │       ├── graphBuilder.js
│   │       ├── geminiService.js
│   │       └── mockPredictor.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── mock-data/
│   ├── services.json
│   └── incidents.json
└── README.md
```

## What's next (beyond hackathon scope)

- Replace mock `services.json` with real graph extraction from actual repos/configs (Gemini-based static analysis)
- Ingest real CI/CD webhook payloads instead of pasted diffs
- Persist incident history in a real database and grow it automatically from postmortem docs
- Slack/GitHub bot integration to comment risk predictions directly on PRs

## Built with

Node.js, Express, Gemini API (`gemini-1.5-flash`), vanilla JS/HTML/CSS.

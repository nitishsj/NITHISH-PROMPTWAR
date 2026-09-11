const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI = null;
function getClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to backend/.env (see .env.example)."
      );
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Asks Gemini to reason over the diff + blast radius + incident history
 * and produce a structured risk assessment per affected downstream service.
 *
 * We ask for strict JSON output so the frontend can render it directly
 * without any fragile text parsing.
 */
async function predictRisk({ diffText, targetService, blastRadius, incidents }) {
  const client = getClient();
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });

  const incidentSummary = incidents
    .map(
      (inc) =>
        `- [${inc.id}, ${inc.severity}] ${inc.title}: ${inc.root_cause}`
    )
    .join("\n") || "No directly relevant past incidents found.";

  const blastRadiusSummary = blastRadius
    .map((b) => `- ${b.service} (${b.hops} hop${b.hops > 1 ? "s" : ""} away)`)
    .join("\n") || "No downstream dependents found.";

  const prompt = `You are a senior site reliability engineer analyzing the blast radius of a code change before it ships.

CHANGED SERVICE: ${targetService}

CODE DIFF:
"""
${diffText}
"""

DOWNSTREAM SERVICES THAT DEPEND ON "${targetService}" (directly or transitively):
${blastRadiusSummary}

RELEVANT PAST INCIDENTS INVOLVING "${targetService}":
${incidentSummary}

TASK:
For each downstream service listed above, assess the risk that THIS diff will break it.
Ground your reasoning in the diff content and, where relevant, the past incidents above.
If a past incident matches a similar pattern (e.g. same kind of schema/contract change), say so explicitly and cite the incident ID.

Respond with ONLY valid JSON, no markdown fences, no commentary, in this exact shape:
{
  "changed_service": "${targetService}",
  "overall_risk": "low" | "medium" | "high" | "critical",
  "predictions": [
    {
      "service": "string",
      "risk_level": "low" | "medium" | "high" | "critical",
      "reasoning": "plain-English explanation, 1-3 sentences",
      "related_incident": "incident ID string or null"
    }
  ]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      "Gemini did not return valid JSON. Raw response: " + text.slice(0, 500)
    );
  }
}

module.exports = { predictRisk };

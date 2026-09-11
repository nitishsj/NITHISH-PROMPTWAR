const express = require("express");
const router = express.Router();
const {
  buildGraph,
  loadServices,
  loadIncidents,
  computeBlastRadius,
  findRelevantIncidents,
} = require("../services/graphBuilder");
const { predictRisk } = require("../services/geminiService");
const { mockPredictRisk } = require("../services/mockPredictor");

/**
 * Guesses which service a diff belongs to by looking for the service
 * name inside the diff text (e.g. a file path like
 * "services/payment-service/routes/charge.js"). This is a simple
 * heuristic for the hackathon demo - a real version would use the PR's
 * repo/file metadata instead of text sniffing.
 */
function detectTargetService(diffText, services) {
  const lower = diffText.toLowerCase();
  const match = services.find((s) => lower.includes(s.name.toLowerCase()));
  return match ? match.name : null;
}

router.post("/", async (req, res) => {
  try {
    const { diffText, targetService: providedTarget } = req.body;

    if (!diffText || !diffText.trim()) {
      return res.status(400).json({ error: "diffText is required" });
    }

    const services = loadServices();
    const incidents = loadIncidents();
    const graph = buildGraph();

    const targetService =
      providedTarget || detectTargetService(diffText, services);

    if (!targetService) {
      return res.status(400).json({
        error:
          "Could not detect which service this diff belongs to. Pass 'targetService' explicitly, or mention a known service name (e.g. 'payment-service') in the diff.",
      });
    }

    const blastRadius = computeBlastRadius(targetService, graph);
    const relevantIncidents = findRelevantIncidents(targetService, incidents);

    let result;
    try {
      result = await predictRisk({
        diffText,
        targetService,
        blastRadius,
        incidents: relevantIncidents,
      });
      result.source = "gemini";
    } catch (geminiErr) {
      // Fallback so the demo never dies if the API key/quota isn't available.
      console.warn("Gemini call failed, using mock fallback:", geminiErr.message);
      result = mockPredictRisk({ targetService, blastRadius, incidents: relevantIncidents });
      result.source = "mock-fallback";
      result.fallback_reason = geminiErr.message;
    }

    res.json({
      targetService,
      blastRadius,
      relevantIncidents,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

/**
 * Simple rule-based fallback, used only if the live Gemini call fails
 * (e.g. missing API key during setup, or hitting a rate limit mid-demo).
 * It gives every downstream service a risk level based on hop distance
 * and whether a past incident touched it, so the UI still has something
 * meaningful to show.
 */
function mockPredictRisk({ targetService, blastRadius, incidents }) {
  const incidentServices = new Set(
    incidents.flatMap((inc) => inc.affected_services)
  );

  const predictions = blastRadius.map((b) => {
    const hasIncidentHistory = incidentServices.has(b.service);
    let risk_level = "low";
    if (b.hops === 1 && hasIncidentHistory) risk_level = "high";
    else if (b.hops === 1) risk_level = "medium";
    else if (hasIncidentHistory) risk_level = "medium";

    const relatedIncident = incidents.find((inc) =>
      inc.affected_services.includes(b.service)
    );

    return {
      service: b.service,
      risk_level,
      reasoning: relatedIncident
        ? `${b.service} is ${b.hops} hop(s) from ${targetService} and was affected by a past incident (${relatedIncident.id}) with a similar pattern.`
        : `${b.service} is ${b.hops} hop(s) from ${targetService} with no directly matching past incident, but transitive dependency changes can still propagate.`,
      related_incident: relatedIncident ? relatedIncident.id : null,
    };
  });

  const overall_risk = predictions.some((p) => p.risk_level === "high")
    ? "high"
    : predictions.some((p) => p.risk_level === "medium")
    ? "medium"
    : "low";

  return { changed_service: targetService, overall_risk, predictions };
}

module.exports = { mockPredictRisk };

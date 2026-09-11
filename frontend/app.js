const API_BASE = "";

const SAMPLE_DIFFS = {
  risky: `--- a/services/payment-service/routes/charge.js
+++ b/services/payment-service/routes/charge.js
@@ -18,10 +18,9 @@ router.post('/charge', async (req, res) => {
   const result = await chargeCard(req.body);
-  res.json({
-    transactionId: result.id,
-    status: result.status
-  });
+  // Renamed field to match new internal naming convention
+  res.json({
+    txnRef: result.id,
+    status: result.status
+  });
 });`,
  safe: `--- a/services/notification-service/routes/email.js
+++ b/services/notification-service/routes/email.js
@@ -5,6 +5,8 @@ router.post('/email', async (req, res) => {
   const { to, subject, body } = req.body;
+  // Added logging only, no response shape change
+  console.log('Sending email to', to);
   const result = await sendEmail(to, subject, body);
   res.json({ sent: true, id: result.id });
 });`,
};

let graphData = null;

async function loadGraph() {
  const res = await fetch(`${API_BASE}/api/graph`);
  graphData = await res.json();
  renderGraph(graphData, {});
}

function computeLayers(nodes, edges) {
  // edges: {from, to} means "from depends_on to"
  const depMap = {};
  nodes.forEach((n) => (depMap[n.id] = []));
  edges.forEach((e) => depMap[e.from].push(e.to));

  const layerCache = {};
  function layerOf(id) {
    if (layerCache[id] !== undefined) return layerCache[id];
    const deps = depMap[id] || [];
    if (deps.length === 0) {
      layerCache[id] = 0;
      return 0;
    }
    const layer = 1 + Math.max(...deps.map(layerOf));
    layerCache[id] = layer;
    return layer;
  }

  nodes.forEach((n) => layerOf(n.id));
  return layerCache;
}

function renderGraph(graph, riskByService) {
  const svg = document.getElementById("graph-svg");
  svg.innerHTML = "";

  const { nodes, edges } = graph;
  const layers = computeLayers(nodes, edges);
  const maxLayer = Math.max(...Object.values(layers));

  const width = 700;
  const height = 460;
  const layerHeight = height / (maxLayer + 1.4);

  const positions = {};
  for (let l = 0; l <= maxLayer; l++) {
    const nodesInLayer = nodes.filter((n) => layers[n.id] === l);
    const spacing = width / (nodesInLayer.length + 1);
    nodesInLayer.forEach((n, idx) => {
      positions[n.id] = {
        x: spacing * (idx + 1),
        y: height - 50 - l * layerHeight,
      };
    });
  }

  const ns = "http://www.w3.org/2000/svg";

  // Draw edges first (so nodes sit on top)
  edges.forEach((e) => {
    const from = positions[e.from];
    const to = positions[e.to];
    if (!from || !to) return;
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    line.setAttribute("class", "edge-line");
    svg.appendChild(line);
  });

  // Draw nodes
  nodes.forEach((n) => {
    const pos = positions[n.id];
    if (!pos) return;

    const g = document.createElementNS(ns, "g");
    const risk = riskByService[n.id];
    if (risk) g.setAttribute("class", `node node-${risk}`);
    if (riskByService.__target === n.id) {
      g.setAttribute("class", (g.getAttribute("class") || "") + " node-target");
    }

    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", pos.x);
    circle.setAttribute("cy", pos.y);
    circle.setAttribute("r", 34);
    circle.setAttribute("class", "node-circle");
    if (risk) {
      circle.style.stroke = riskColor(risk);
      circle.style.fill = riskColor(risk, true);
    }
    g.appendChild(circle);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", pos.x);
    label.setAttribute("y", pos.y + 50);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "node-label");
    label.textContent = n.id;
    g.appendChild(label);

    svg.appendChild(g);
  });
}

function riskColor(level, faint) {
  const colors = {
    low: "#4C9A6A",
    medium: "#E8A33D",
    high: "#D9713C",
    critical: "#C0432F",
  };
  const c = colors[level] || "#3A4150";
  if (!faint) return c;
  return c + "22"; // faint fill version
}

function setStatus(msg, isError) {
  const el = document.getElementById("status-line");
  el.textContent = msg;
  el.className = "status-line" + (isError ? " error" : "");
}

function fallbackNote(data) {
  const reason = data.fallback_reason || "";
  if (/GEMINI_API_KEY is not set/i.test(reason)) {
    return " (no Gemini API key configured — add one for live reasoning)";
  }
  if (/503|overloaded|UNAVAILABLE|429|rate limit/i.test(reason)) {
    return " (Gemini is temporarily overloaded — showing offline reasoning, try again shortly)";
  }
  return " (Gemini call failed — showing offline reasoning)";
}

function renderResults(data) {
  const container = document.getElementById("results");
  container.innerHTML = "";

  const banner = document.createElement("div");
  banner.className = "overall-banner";
  banner.innerHTML = `<strong>${data.changed_service}</strong> → overall risk: <strong style="color:${riskColor(data.overall_risk)}">${data.overall_risk}</strong>${data.source === "mock-fallback" ? fallbackNote(data) : ""}`;
  container.appendChild(banner);

  data.predictions.forEach((p) => {
    const card = document.createElement("div");
    card.className = `result-card ${p.risk_level}`;
    card.innerHTML = `
      <span class="result-service">${p.service}</span>
      <span class="result-risk">${p.risk_level} risk</span>
      <div class="result-reason">${p.reasoning}</div>
      ${p.related_incident ? `<div class="result-incident">related: ${p.related_incident}</div>` : ""}
    `;
    container.appendChild(card);
  });
}

async function analyze() {
  const diffText = document.getElementById("diff-input").value.trim();
  if (!diffText) {
    setStatus("Paste a diff first.", true);
    return;
  }

  const btn = document.getElementById("analyze-btn");
  btn.disabled = true;
  setStatus("Analyzing dependency graph and reasoning over risk…");
  document.getElementById("results").innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diffText }),
    });
    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error || "Something went wrong.", true);
      btn.disabled = false;
      return;
    }

    setStatus(`Analyzed change to ${data.targetService}.`);
    renderResults(data);

    const riskByService = { __target: data.targetService };
    data.predictions.forEach((p) => (riskByService[p.service] = p.risk_level));
    renderGraph(graphData, riskByService);
  } catch (err) {
    setStatus("Request failed: " + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("analyze-btn").addEventListener("click", analyze);

document.querySelectorAll(".sample-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-sample");
    document.getElementById("diff-input").value = SAMPLE_DIFFS[key];
  });
});

loadGraph();

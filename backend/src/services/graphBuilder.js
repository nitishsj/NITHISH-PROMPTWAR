const fs = require("fs");
const path = require("path");

/**
 * Builds a dependency graph from service config data.
 * In the hackathon demo this reads mock-data/services.json.
 * In a real deployment, this would instead call Gemini to extract
 * edges from raw configs/code (see extractEdgesWithGemini below,
 * which is included but not required for the demo path).
 */
function loadServices() {
  const filePath = path.join(__dirname, "../../../mock-data/services.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw).services;
}

function loadIncidents() {
  const filePath = path.join(__dirname, "../../../mock-data/incidents.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw).incidents;
}

/**
 * Builds a graph structure: nodes + directed edges (A depends_on B).
 * Also computes reverse edges (who depends ON this service) since
 * that's what matters for blast-radius: if service X breaks, who
 * calling X gets hurt.
 */
function buildGraph() {
  const services = loadServices();
  const nodes = services.map((s) => ({
    id: s.name,
    description: s.description,
    endpoints: s.endpoints,
    tables: s.database_tables,
  }));

  const edges = [];
  const dependents = {}; // reverse map: service -> [services that depend on it]

  services.forEach((s) => {
    dependents[s.name] = dependents[s.name] || [];
  });

  services.forEach((s) => {
    s.depends_on.forEach((dep) => {
      edges.push({ from: s.name, to: dep, type: "depends_on" });
      dependents[dep] = dependents[dep] || [];
      dependents[dep].push(s.name);
    });
  });

  return { nodes, edges, dependents };
}

/**
 * Given a service name, returns everything downstream that could be
 * affected if that service breaks or changes (its "blast radius"),
 * walking the dependents graph outward (BFS), with distance/hop count.
 */
function computeBlastRadius(serviceName, graph) {
  const visited = new Set([serviceName]);
  const queue = [{ id: serviceName, distance: 0 }];
  const radius = [];

  while (queue.length > 0) {
    const current = queue.shift();
    const dependents = graph.dependents[current.id] || [];
    dependents.forEach((depName) => {
      if (!visited.has(depName)) {
        visited.add(depName);
        radius.push({ service: depName, hops: current.distance + 1 });
        queue.push({ id: depName, distance: current.distance + 1 });
      }
    });
  }

  return radius;
}

/**
 * Finds past incidents relevant to a given service - i.e. incidents
 * where this service was the root cause or an affected party. This
 * evidence gets fed to Gemini so its risk explanation is grounded in
 * real history rather than generic guessing.
 */
function findRelevantIncidents(serviceName, allIncidents) {
  return allIncidents.filter((inc) =>
    inc.affected_services.includes(serviceName)
  );
}

module.exports = {
  loadServices,
  loadIncidents,
  buildGraph,
  computeBlastRadius,
  findRelevantIncidents,
};

const express = require("express");
const router = express.Router();
const { buildGraph } = require("../services/graphBuilder");

router.get("/", (req, res) => {
  try {
    const graph = buildGraph();
    res.json(graph);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const graphRoute = require("./routes/graph");
const predictRoute = require("./routes/predict");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Serve the demo frontend as static files
app.use(express.static(path.join(__dirname, "../../frontend")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/graph", graphRoute);
app.use("/api/predict", predictRoute);

app.listen(PORT, () => {
  console.log(`Blast Radius Predictor backend running on http://localhost:${PORT}`);
});

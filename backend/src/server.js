import express from "express";
import pg from "pg";
import client from "prom-client";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000
});

client.collectDefaultMetrics();

const requests = new client.Counter({
  name: "auralis_http_requests_total",
  help: "Total Auralis HTTP requests",
  labelNames: ["method", "route", "status"]
});

app.use((req, res, next) => {
  res.on("finish", () => {
    requests.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status: String(res.statusCode)
    });
  });
  next();
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "ok", service: "auralis-api" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

app.get("/api/overview", async (_req, res) => {
  const [tracks, artists] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count, COALESCE(SUM(plays),0)::bigint AS plays FROM tracks"),
    pool.query("SELECT COUNT(*)::int AS count FROM artists")
  ]);
  res.json({
    tracks: tracks.rows[0].count,
    streams: Number(tracks.rows[0].plays),
    artists: artists.rows[0].count,
    royaltyModel: "artist-first"
  });
});

app.get("/api/tracks", async (_req, res) => {
  const result = await pool.query(`
    SELECT t.id, t.title, t.genre, t.duration_seconds, t.cover_url,
           t.audio_url, t.plays, t.owned_token_id,
           a.name AS artist, a.verified
    FROM tracks t
    JOIN artists a ON a.id=t.artist_id
    ORDER BY t.plays DESC, t.id
  `);
  res.json(result.rows);
});

app.get("/api/artists", async (_req, res) => {
  const result = await pool.query(`
    SELECT a.id, a.name, a.genre, a.verified, a.wallet_address,
           COUNT(t.id)::int AS tracks,
           COALESCE(SUM(t.plays),0)::bigint AS streams
    FROM artists a
    LEFT JOIN tracks t ON t.artist_id=a.id
    GROUP BY a.id
    ORDER BY streams DESC
  `);
  res.json(result.rows);
});

app.get("/api/playlists", async (_req, res) => {
  const result = await pool.query("SELECT id,name,description,cover_url FROM playlists ORDER BY id");
  res.json(result.rows);
});

app.post("/api/tracks/:id/play", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid track ID" });

  const result = await pool.query(
    "UPDATE tracks SET plays=plays+1 WHERE id=$1 RETURNING id, plays",
    [id]
  );

  if (!result.rowCount) return res.status(404).json({ error: "Track not found" });
  res.json(result.rows[0]);
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, "0.0.0.0", () => console.log(`Auralis API listening on ${port}`));

export { app };

import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

process.env.DATABASE_URL =
"postgresql://test:test@localhost:5432/auralis";

process.env.AUDIUS_API_KEY = "test-api-key";
process.env.AUDIUS_BEARER_TOKEN = "test-bearer-token";

const { app, pool, audiusSdk } =
await import("../src/server.js");

const server = app.listen(0, "127.0.0.1");

await new Promise((resolve) => {
  server.once("listening", resolve);
});

const baseUrl =
`http://127.0.0.1:${server.address().port}`;

let queryHandler = async () => ({
  rows: [],
  rowCount: 0
});

/*
 * Replace PostgreSQL calls with controlled test responses.
 */
pool.query = (...args) => queryHandler(...args);

const request = async (path, options = {}) => {
  return fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options
  });
};

test.after(() => {
  server.close();
});


/* =========================================================
 * HEALTH
 * ========================================================= */

test("GET /api/health returns healthy status", async () => {
  queryHandler = async (sql) => {
    assert.equal(sql, "SELECT 1");

    return {
      rows: [
        {
          "?column?": 1
        }
      ],
      rowCount: 1
    };
  };

  const response = await request("/api/health");

  assert.equal(response.status, 200);

  assert.deepEqual(await response.json(), {
    status: "ok",
    database: "ok",
    service: "auralis-api",
    audius: "configured"
  });
});


test("GET /api/health returns degraded status when database fails", async () => {
  queryHandler = async () => {
    throw new Error("database unavailable");
  };

  const response = await request("/api/health");

  assert.equal(response.status, 503);

  assert.deepEqual(await response.json(), {
    status: "degraded",
    database: "unavailable"
  });
});


/* =========================================================
 * OVERVIEW
 * ========================================================= */

test("GET /api/overview returns track, stream and artist totals", async () => {
  queryHandler = async (sql) => {
    if (sql.includes("FROM tracks")) {
      return {
        rows: [
          {
            count: 4,
     plays: "321"
          }
        ],
        rowCount: 1
      };
    }

    return {
      rows: [
        {
          count: 3
        }
      ],
     rowCount: 1
    };
  };

  const response = await request("/api/overview");

  assert.equal(response.status, 200);

  assert.deepEqual(await response.json(), {
    tracks: 4,
    streams: 321,
    artists: 3,
    royaltyModel: "artist-first"
  });
});


/* =========================================================
 * TRACKS
 * ========================================================= */

test("GET /api/tracks maps Audius tracks to stream endpoint", async () => {
  queryHandler = async () => ({
    rows: [
      {
        id: 1,
        title: "Midnight Drive",
        genre: "Synthwave",
        duration_seconds: 258,
        cover_url: "/covers/neon.svg",
        audio_url: "/audio/demo.mp3",
        audius_track_id: "93v00",
        plays: 184295,
        owned_token_id: "AUR-1842",
        artist: "Neon District",
        verified: true
      },
      {
        id: 2,
        title: "Legacy Track",
        genre: "Indie",
        duration_seconds: 200,
        cover_url: "/covers/legacy.svg",
        audio_url: "/audio/demo.mp3",
        audius_track_id: null,
        plays: 10,
        owned_token_id: null,
        artist: "Echo Harbor",
        verified: true
      }
    ],
    rowCount: 2
  });

  const response = await request("/api/tracks");

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(
    body[0].audio_url,
    "/api/tracks/1/stream"
  );

  assert.equal(
    body[1].audio_url,
    "/audio/demo.mp3"
  );

  assert.equal(
    body[0].audius_track_id,
    "93v00"
  );
});


test("GET /api/tracks returns 500 when database query fails", async () => {
  queryHandler = async () => {
    throw new Error("database query failed");
  };

  const response = await request("/api/tracks");

  assert.equal(response.status, 500);

  assert.deepEqual(await response.json(), {
    error: "Internal server error"
  });
});


/* =========================================================
 * ARTISTS
 * ========================================================= */

test("GET /api/artists returns artists", async () => {
  queryHandler = async () => ({
    rows: [
      {
        id: 1,
        name: "Neon District",
        genre: "Synthwave",
        verified: true,
        wallet_address: "0x123",
        tracks: 2,
        streams: "1000"
      }
    ],
    rowCount: 1
  });

  const response = await request("/api/artists");

  assert.equal(response.status, 200);

  assert.deepEqual(await response.json(), [
    {
      id: 1,
      name: "Neon District",
      genre: "Synthwave",
      verified: true,
      wallet_address: "0x123",
      tracks: 2,
      streams: "1000"
    }
  ]);
});


/* =========================================================
 * PLAYLISTS
 * ========================================================= */

test("GET /api/playlists returns playlists", async () => {
  queryHandler = async () => ({
    rows: [
      {
        id: 1,
        name: "Night Drive",
        description: "Late-night electronic music",
        cover_url: "/covers/neon.svg"
      }
    ],
    rowCount: 1
  });

  const response = await request("/api/playlists");

  assert.equal(response.status, 200);

  assert.deepEqual(await response.json(), [
    {
      id: 1,
      name: "Night Drive",
      description: "Late-night electronic music",
      cover_url: "/covers/neon.svg"
    }
  ]);
});


/* =========================================================
 * PLAY TRACK
 * ========================================================= */

test("POST /api/tracks/:id/play rejects invalid IDs", async () => {
  const response =
  await request("/api/tracks/not-a-number/play", {
    method: "POST"
  });

  assert.equal(response.status, 400);

  assert.deepEqual(await response.json(), {
    error: "Invalid track ID"
  });
});


test("POST /api/tracks/:id/play returns 404 for missing tracks", async () => {
  queryHandler = async () => ({
    rows: [],
    rowCount: 0
  });

  const response =
  await request("/api/tracks/999/play", {
    method: "POST"
  });

  assert.equal(response.status, 404);

  assert.deepEqual(await response.json(), {
    error: "Track not found"
  });
});


test("POST /api/tracks/:id/play increments track plays", async () => {
  queryHandler = async (sql, params) => {
    assert.match(
      sql,
      /UPDATE tracks SET plays=plays\+1/
    );

    assert.deepEqual(params, [1]);

    return {
      rows: [
        {
          id: 1,
          plays: 184296
        }
      ],
      rowCount: 1
    };
  };

  const response =
  await request("/api/tracks/1/play", {
    method: "POST"
  });

  assert.equal(response.status, 200);

  assert.deepEqual(await response.json(), {
    id: 1,
    plays: 184296
  });
});


/* =========================================================
 * AUDIUS STREAM
 * ========================================================= */

test("GET /api/tracks/:id/stream rejects invalid IDs", async () => {
  const response =
  await request("/api/tracks/abc/stream");

  assert.equal(response.status, 400);

  assert.deepEqual(await response.json(), {
    error: "Invalid track ID"
  });
});


test("GET /api/tracks/:id/stream returns 404 for missing tracks", async () => {
  queryHandler = async () => ({
    rows: [],
    rowCount: 0
  });

  const response =
  await request("/api/tracks/999/stream");

  assert.equal(response.status, 404);

  assert.deepEqual(await response.json(), {
    error: "Track not found"
  });
});


test("GET /api/tracks/:id/stream returns 404 when Audius ID is not configured", async () => {
  queryHandler = async () => ({
    rows: [
      {
        audius_track_id: null
      }
    ],
    rowCount: 1
  });

  const response =
  await request("/api/tracks/2/stream");

  assert.equal(response.status, 404);

  assert.deepEqual(await response.json(), {
    error: "Audius track is not configured"
  });
});


test("GET /api/tracks/:id/stream returns 404 for non-streamable Audius tracks", async () => {
  queryHandler = async () => ({
    rows: [
      {
        audius_track_id: "not-streamable"
      }
    ],
    rowCount: 1
  });

  const originalGetTrack =
  audiusSdk.tracks.getTrack;

  audiusSdk.tracks.getTrack =
  async () => ({
    data: {
      isStreamable: false
    }
  });

  try {
    const response =
    await request("/api/tracks/3/stream");

    assert.equal(response.status, 404);

    assert.deepEqual(await response.json(), {
      error: "Track is not streamable"
    });
  } finally {
    audiusSdk.tracks.getTrack =
    originalGetTrack;
  }
});


test("GET /api/tracks/:id/stream redirects to Audius", async () => {
  queryHandler = async () => ({
    rows: [
      {
        audius_track_id: "93v00"
      }
    ],
    rowCount: 1
  });

  const originalGetTrack =
  audiusSdk.tracks.getTrack;

  audiusSdk.tracks.getTrack =
  async ({ trackId }) => {
    assert.equal(trackId, "93v00");

    return {
      data: {
        isStreamable: true
      }
    };
  };

  try {
    const response =
    await request("/api/tracks/1/stream");

    assert.equal(response.status, 302);

    assert.equal(
      response.headers.get("location"),
                 "https://api.audius.co/v1/tracks/93v00/stream"
    );
  } finally {
    audiusSdk.tracks.getTrack =
    originalGetTrack;
  }
});


test("GET /api/tracks/:id/stream returns 502 when Audius fails", async () => {
  queryHandler = async () => ({
    rows: [
      {
        audius_track_id: "93v00"
      }
    ],
    rowCount: 1
  });

  const originalGetTrack =
  audiusSdk.tracks.getTrack;

  audiusSdk.tracks.getTrack =
  async () => {
    throw new Error("Audius unavailable");
  };

  try {
    const response =
    await request("/api/tracks/1/stream");

    assert.equal(response.status, 502);

    assert.deepEqual(await response.json(), {
      error: "Unable to retrieve Audius stream"
    });
  } finally {
    audiusSdk.tracks.getTrack =
    originalGetTrack;
  }
});


/* =========================================================
 * METRICS
 * ========================================================= */

test("GET /metrics returns Prometheus metrics", async () => {
  queryHandler = async () => ({
    rows: [],
    rowCount: 0
  });

  const response =
  await request("/metrics");

  assert.equal(response.status, 200);

  const contentType =
  response.headers.get("content-type");

  assert.match(contentType, /text\/plain/);

  const body =
  await response.text();

  assert.match(
    body,
    /auralis_http_requests_total/
  );
});


/* =========================================================
 * 404
 * ========================================================= */

test("unknown routes return JSON 404", async () => {
  const response =
  await request("/does-not-exist");

  assert.equal(response.status, 404);

  assert.deepEqual(await response.json(), {
    error: "Not found"
  });
});


/* =========================================================
 * ERROR HANDLER
 * ========================================================= */

test("Express error middleware returns 500 for an unhandled route error", async () => {
  const originalQuery = pool.query;

  pool.query = async () => {
    throw new Error(
      "unexpected database failure"
    );
  };

  try {
    const response =
    await request("/api/overview");

    assert.equal(response.status, 500);

    assert.deepEqual(await response.json(), {
      error: "Internal server error"
    });
  } finally {
    pool.query = originalQuery;
  }
});

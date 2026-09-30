const $ = (s) => document.querySelector(s);

let tracks = [];
let current = 0;
let playing = false;

const audio = new Audio();
audio.preload = "metadata";

async function api(path, options = {}) {
  const r = await fetch(path, options);

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status} ${text}`.trim());
  }

  return r.json();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

async function load() {
  try {
    const [overview, trackData, artists, playlists] = await Promise.all([
      api("/api/overview"),
                                                                        api("/api/tracks"),
                                                                        api("/api/artists"),
                                                                        api("/api/playlists")
    ]);

    tracks = trackData;

    // FIX: index.html uses #streamCount, not #trackCount
    $("#streamCount").textContent =
    Number(overview.streams ?? 0).toLocaleString();

    $("#artistCount").textContent =
    Number(overview.artists ?? artists.length).toLocaleString();

    $("#tracks").innerHTML = tracks.map((t, i) => `
    <article class="track-card" data-index="${i}">
    <div
    class="cover"
    style="background-image:url('${escapeHtml(t.cover_url)}')"
    >
    ${escapeHtml(t.title.slice(0, 1))}
    </div>

    <button class="card-play" aria-label="Play ${escapeHtml(t.title)}">
    ▶
    </button>

    <div class="track-info">
    <strong>${escapeHtml(t.title)}</strong>
    <span>${escapeHtml(t.artist)}</span>
    </div>

    <div class="track-bottom">
    <span>${escapeHtml(t.genre)}</span>
    <span>${Number(t.plays).toLocaleString()} plays</span>
    </div>
    </article>
    `).join("");

    // FIX: index.html uses #artistGrid, not #artists
    $("#artistGrid").innerHTML = artists.map((a, i) => `
    <article class="artist-card">
    <div class="avatar avatar-${i % 4}">
    ${escapeHtml(a.name.slice(0, 1))}
    </div>

    <div>
    <strong>
    ${escapeHtml(a.name)} ${a.verified ? "✓" : ""}
    </strong>

    <span>
    ${escapeHtml(a.genre)} · ${a.tracks} releases
    </span>
    </div>

    <b>${Number(a.streams).toLocaleString()} streams</b>
    </article>
    `).join("");

    $("#playlists").innerHTML = playlists.map((p) => `
    <article class="playlist">
    <div
    class="playlist-art"
    style="background-image:url('${escapeHtml(p.cover_url)}')"
    ></div>

    <strong>${escapeHtml(p.name)}</strong>
    <span>${escapeHtml(p.description)}</span>
    </article>
    `).join("");

    document.querySelectorAll(".track-card").forEach((card) => {
      card.addEventListener("click", () => {
        selectTrack(Number(card.dataset.index));
      });
    });

  } catch (error) {
    console.error("Failed to load Auralis data:", error);
    toast("Failed to load music");
  }
}

async function selectTrack(index) {
  if (!tracks.length) return;

  const t = tracks[index];

  if (!t) return;

  current = index;

  const streamUrl = `/api/tracks/${t.id}/stream`;

  audio.pause();
  audio.currentTime = 0;
  audio.src = streamUrl;

  $("#nowTitle").textContent = t.title;
  $("#nowArtist").textContent = t.artist;

  $("#miniCover").style.backgroundImage =
  `url('${escapeHtml(t.cover_url)}')`;

  $("#miniCover").textContent = "";

  playing = true;
  $("#play").textContent = "Ⅱ";

  try {
    await audio.play();

    await api(`/api/tracks/${t.id}/play`, {
      method: "POST"
    }).catch(() => {});

    toast(`Playing ${t.title}`);

  } catch (error) {
    console.error("Audio playback failed:", error);

    playing = false;
    $("#play").textContent = "▶";

    toast("Unable to play this track");
  }
}

function next() {
  if (tracks.length) {
    selectTrack((current + 1) % tracks.length);
  }
}

function prev() {
  if (tracks.length) {
    selectTrack((current - 1 + tracks.length) % tracks.length);
  }
}

$("#play").addEventListener("click", () => {
  if (!tracks.length) return;

  if (!audio.src) {
    selectTrack(current);
    return;
  }

  if (audio.paused) {
    audio.play()
    .then(() => {
      playing = true;
      $("#play").textContent = "Ⅱ";
    })
    .catch((error) => {
      console.error("Audio resume failed:", error);
      toast("Unable to resume playback");
    });

  } else {
    audio.pause();
    playing = false;
    $("#play").textContent = "▶";
  }
});

$("#next").addEventListener("click", next);
$("#prev").addEventListener("click", prev);

audio.addEventListener("play", () => {
  playing = true;
  $("#play").textContent = "Ⅱ";
});

audio.addEventListener("pause", () => {
  playing = false;
  $("#play").textContent = "▶";
});

audio.addEventListener("ended", () => {
  next();
});

audio.addEventListener("timeupdate", () => {
  if (!audio.duration || !Number.isFinite(audio.duration)) return;

  const percentage = (audio.currentTime / audio.duration) * 100;

  $("#progressBar").style.width = `${percentage}%`;

  const minutes = Math.floor(audio.currentTime / 60);

  const seconds = Math.floor(audio.currentTime % 60)
  .toString()
  .padStart(2, "0");

  $("#time").textContent = `${minutes}:${seconds}`;
});

audio.addEventListener("error", () => {
  console.error("Audio element error:", audio.error);

  playing = false;
  $("#play").textContent = "▶";

  toast("Audio stream unavailable");
});

$("#progressBar").parentElement.addEventListener("click", (event) => {
  if (!audio.duration || !Number.isFinite(audio.duration)) return;

  const rect = event.currentTarget.getBoundingClientRect();

  const percentage =
  (event.clientX - rect.left) / rect.width;

  audio.currentTime = percentage * audio.duration;
});

function toast(message) {
  const el = $("#toast");

  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 2200);
}

const searchInput = $("#search");

if (searchInput) {
  searchInput.addEventListener("input", (event) => {
    const term = event.target.value.trim().toLowerCase();

    const found = tracks.find((t) =>
    `${t.title} ${t.artist}`.toLowerCase().includes(term)
    );

    if (found) {
      selectTrack(tracks.indexOf(found));
    }
  });
}

load();
// CI/CD change-detection test - frontend
//test changes

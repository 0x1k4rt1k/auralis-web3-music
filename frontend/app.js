const $ = (s) => document.querySelector(s);
let tracks = [];
let current = 0;
let playing = false;
let seconds = 0;
let timer;

async function api(path, options) {
  const r = await fetch(path, options);
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

function coverMarkup(url, title) {
  return `<div class="cover" style="background-image:url('${url}')"><span>${title.slice(0,1)}</span></div>`;
}

async function load() {
  const [overview, trackData, artists, playlists] = await Promise.all([
    api("/api/overview"), api("/api/tracks"), api("/api/artists"), api("/api/playlists")
  ]);
  tracks = trackData;
  $("#streamCount").textContent = Number(overview.streams).toLocaleString();
  $("#artistCount").textContent = overview.artists;

  $("#tracks").innerHTML = tracks.map((t, i) => `
    <article class="track-card" data-index="${i}">
      ${coverMarkup(t.cover_url, t.title)}
      <button class="card-play" aria-label="Play ${t.title}">▶</button>
      <div class="track-info"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.artist)}</span></div>
      <div class="track-bottom"><span>${escapeHtml(t.genre)}</span><span>${Number(t.plays).toLocaleString()} plays</span></div>
    </article>
  `).join("");

  document.querySelectorAll(".track-card").forEach(card => {
    card.addEventListener("click", () => selectTrack(Number(card.dataset.index)));
  });

  $("#artistGrid").innerHTML = artists.map((a, i) => `
    <article class="artist-card"><div class="avatar avatar-${i % 4}">${escapeHtml(a.name.slice(0,1))}</div><div><strong>${escapeHtml(a.name)} ${a.verified ? "✓" : ""}</strong><span>${escapeHtml(a.genre)} · ${a.tracks} releases</span></div><b>${Number(a.streams).toLocaleString()} streams</b></article>
  `).join("");

  $("#playlists").innerHTML = playlists.map(p => `
    <article class="playlist"><div class="playlist-art" style="background-image:url('${p.cover_url}')"></div><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.description)}</span></article>
  `).join("");
}

function escapeHtml(v) {
  const d = document.createElement("div"); d.textContent = v; return d.innerHTML;
}

async function selectTrack(index) {
  current = index;
  seconds = 0;
  const t = tracks[current];
  $("#nowTitle").textContent = t.title;
  $("#nowArtist").textContent = `${t.artist} · ${t.genre}`;
  $("#miniCover").textContent = t.title.slice(0,1);
  playing = true;
  $("#play").textContent = "Ⅱ";
  await api(`/api/tracks/${t.id}/play`, { method: "POST" }).catch(() => {});
  clearInterval(timer);
  timer = setInterval(() => {
    seconds++;
    const pct = Math.min(100, seconds / t.duration_seconds * 100);
    $("#progressBar").style.width = `${pct}%`;
    $("#time").textContent = `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;
    if (seconds >= t.duration_seconds) next();
  }, 1000);
}

function next() { if (tracks.length) selectTrack((current + 1) % tracks.length); }
function prev() { if (tracks.length) selectTrack((current - 1 + tracks.length) % tracks.length); }

$("#play").addEventListener("click", () => {
  if (!tracks.length) return;
  if (!playing) selectTrack(current);
  else {
    playing = false;
    $("#play").textContent = "▶";
    clearInterval(timer);
  }
});
$("#next").addEventListener("click", next);
$("#prev").addEventListener("click", prev);

function connectWallet() {
  const address = "0x71A3...9F2C";
  $("#walletBtn").textContent = "0x71A3...9F2C";
  $("#walletState").textContent = address;
  $("#walletBtn2").textContent = "Wallet connected ✓";
  toast("Demo wallet connected — Web3 integration comes next.");
}
$("#walletBtn").addEventListener("click", connectWallet);
$("#walletBtn2").addEventListener("click", connectWallet);

function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 2800);
}

$("#searchBtn").addEventListener("click", () => {
  const term = prompt("Search Auralis");
  if (!term) return;
  const found = tracks.find(t => `${t.title} ${t.artist}`.toLowerCase().includes(term.toLowerCase()));
  if (found) {
    selectTrack(tracks.indexOf(found));
    toast(`Playing ${found.title}`);
  } else toast("No matching release found.");
});

load().catch(err => {
  console.error(err);
  toast("Auralis API is unavailable.");
});

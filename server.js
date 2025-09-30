require("dotenv").config();
const { buildPlaylistFromDescription } = require("./utils/recommender");

const express = require("express");
const bodyParser = require("body-parser");

const { spotifyApi, ensureAccessToken } = require("./utils/spotifyClient");
const authRoutes = require("./auth");

const app = express();
app.use(bodyParser.json());

function registerPost(path, handler) {
  console.log(`Registering POST ${path}`);
  app.post(path, handler);
}

function registerGet(path, handler) {
  console.log(`Registering GET ${path}`);
  app.get(path, handler);
}

app.use("/", authRoutes);


function formatSpotifyError(err) {
    return { error: JSON.stringify(err, null, 2) };
  }
  
registerPost("/searchTracks", async (req, res) => {
  try {
    await ensureAccessToken();
    const { query, limit = 10 } = req.body;
    const results = await spotifyApi.searchTracks(query, { limit });

    res.json({
      tracks: results.body.tracks.items.map((t) => ({
        id: t.id,
        name: t.name,
        artists: t.artists.map((a) => a.name),
        album: t.album.name,
        url: t.external_urls.spotify,
        preview_url: t.preview_url,
        display: `${t.name} — ${t.artists.map((a) => a.name).join(", ")}`
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

registerPost("/getRecommendations", async (req, res) => {
  try {
    await ensureAccessToken();
    const { seed_artists = [], seed_genres = [], seed_tracks = [], limit = 10 } = req.body;

    const results = await spotifyApi.getRecommendations({
      seed_artists,
      seed_genres,
      seed_tracks,
      limit
    });

    const formatted = results.body.tracks.map((t, i) => ({
      id: t.id,
      name: t.name,
      artists: t.artists.map((a) => a.name),
      album: t.album.name,
      url: t.external_urls.spotify,
      preview_url: t.preview_url,
      display: `${i + 1}. ${t.name} — ${t.artists.map((a) => a.name).join(", ")}`
    }));

    res.json({ tracks: formatted });
  } catch (err) {
    console.error("getRecommendations error:", err);
    if (err.body && err.body.error) {
      res.status(500).json({ error: err.body.error });
    } else {
      res.status(500).json({ error: err.message || err.toString() });
    }
  }
});

registerPost("/createPlaylist", async (req, res) => {
    try {
      await ensureAccessToken();
      const { name, description = "", tracks = [] } = req.body;
  
      const playlist = await createPlaylistDirect(name, {
        description,
        public: false
      });
  
      if (tracks.length > 0) {
        await spotifyApi.addTracksToPlaylist(
          playlist.id,
          tracks.map((id) => `spotify:track:${id}`)
        );
      }
  
      res.json({
        playlistId: playlist.id,
        url: playlist.external_urls.spotify,
        display: `🎶 Created playlist "${playlist.name}" → ${playlist.external_urls.spotify}`
      });
    } catch (err) {
      const formatted = formatSpotifyError(err);
      console.error("createPlaylist error:", formatted);
      res.status(500).json({ error: formatted });
    }
  });
  

registerPost("/playTrack", async (req, res) => {
  try {
    await ensureAccessToken();
    const { trackId } = req.body;
    await spotifyApi.play({ uris: [`spotify:track:${trackId}`] });
    res.json({ status: "playing" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function createPlaylistDirect(name, options = {}) {
    console.log("[createPlaylistDirect] POST https://api.spotify.com/v1/me/playlists");
    const token = spotifyApi.getAccessToken();
    if (!token) throw new Error("No access token available");
  
    const res = await fetch("https://api.spotify.com/v1/me/playlists", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        public: options.public ?? false,
        description: options.description ?? ""
      })
    });
  

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify API ${res.status}: ${text}`);
    }
  
    return res.json();
}
  
registerPost("/lastfmBuildPlaylist", async (req, res) => {
  try {
    const { description, seedArtist, seedTrack } = req.body;

    if (!description || !seedArtist || !seedTrack) {
      return res.status(400).json({
        error: "Missing required fields: description, seedArtist, seedTrack"
      });
    }

    const results = await buildPlaylistFromDescription(description, seedArtist, seedTrack);
    if (results.length === 0) {
      return res.status(404).json({ error: "No tracks found for given description/seed" });
    }

    await ensureAccessToken();

    const me = await spotifyApi.getMe();
    const userId = me.body.id;

    const playlistName = `${description} - ${seedTrack}`;
    const playlist = await spotifyApi.createPlaylist(
      playlistName,
      {
        description: `Auto-generated from Last.fm recs: "${description}" with seed ${seedArtist} - ${seedTrack}`,
        public: false
      }
    );
    
    const uris = results.map(t => `spotify:track:${t.id}`);
    if (uris.length > 0) {
      await spotifyApi.addTracksToPlaylist(playlist?.body?.id, uris);
    }

    res.json({
      description,
      seed: { artist: seedArtist, track: seedTrack },
      playlist: {
        id: playlist.body.id,
        name: playlist.body.name,
        url: playlist.body.external_urls.spotify
      },
      tracks: results.map((t, i) => ({
        id: t.id,
        name: t.name,
        artist: t.artist,
        url: t.url,
        display: `${i + 1}. ${t.name} — ${t.artist}`
      })),
      display: `Created playlist "${playlist.body.name}" → ${playlist.body.external_urls.spotify}`
    });
  } catch (err) {
    console.error("Error in /lastfmBuildPlaylist:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "No route matched", path: req.path, method: req.method });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Spotify DJ MCP server running at http://127.0.0.1:${PORT}`);
});

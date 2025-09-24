const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));
const { spotifyApi, ensureAccessToken } = require("./spotifyClient");

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

// Simple description → Last.fm tags
const descriptionTagMap = {
  upbeat: ["funk", "dance", "pop"],
  kitchen: ["soul", "rnb"],
  chill: ["chillout", "ambient"],
  jazz: ["jazz"],
  workout: ["hip-hop", "edm"],
  focus: ["lo-fi", "classical"]
};

async function getLastFmSimilarTracks(artist, track, limit = 5) {
  const url = `http://ws.audioscrobbler.com/2.0/?method=track.getsimilar&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.similartracks?.track || []).map(t => ({
    name: t.name,
    artist: t.artist.name
  }));
}

async function getLastFmTopTracksByTag(tag, limit = 5) {
  const url = `http://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(tag)}&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.tracks?.track || []).map(t => ({
    name: t.name,
    artist: t.artist.name
  }));
}

// Look up a Last.fm track on Spotify → return Spotify track ID
async function findSpotifyTrackId(name, artist) {
  await ensureAccessToken();
  const query = `track:${name} artist:${artist}`;
  const results = await spotifyApi.searchTracks(query, { limit: 1 });
  const item = results.body.tracks.items[0];
  return item ? { id: item.id, name: item.name, artist: artist, url: item.external_urls.spotify } : null;
}

async function buildPlaylistFromDescription(description, seedArtist, seedTrack) {
  const lowered = description.toLowerCase();
  let tags = [];
  for (const [keyword, tagList] of Object.entries(descriptionTagMap)) {
    if (lowered.includes(keyword)) {
      tags = [...new Set([...tags, ...tagList])];
    }
  } 
  
  if (tags.length === 0) tags = ["pop"];

  // 1. Similar tracks to the seed
  const similar = await getLastFmSimilarTracks(seedArtist, seedTrack, 5);

  // 2. Top tracks for description tags
  let tagTracks = [];
  for (const tag of tags) {
    const more = await getLastFmTopTracksByTag(tag, 5);
    tagTracks = [...tagTracks, ...more];
  }

  // 3. Deduplicate by name+artist
  const merged = [...similar, ...tagTracks];
  const seen = new Set();
  const unique = merged.filter(t => {
    const key = `${t.artist.toLowerCase()}-${t.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 4. Resolve to Spotify IDs
  const spotifyResults = [];
  for (const t of unique) {
    const match = await findSpotifyTrackId(t.name, t.artist);
    if (match) spotifyResults.push(match);
  }

  return spotifyResults;
}

module.exports = { buildPlaylistFromDescription };

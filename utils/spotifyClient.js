const SpotifyWebApi = require("spotify-web-api-node");

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: "http://127.0.0.1:3000/callback"
}); 

// if there is a refresh token, set it
if (process.env.SPOTIFY_REFRESH_TOKEN) {
  spotifyApi.setRefreshToken(process.env.SPOTIFY_REFRESH_TOKEN);
}

// verifies user has access token
const ensureAccessToken = async () => {
  if (!spotifyApi.getRefreshToken()) {
    throw new Error("No refresh token set. Run /login first.");
  }
  const data = await spotifyApi.refreshAccessToken();
  const accessToken = data.body["access_token"]; 
  spotifyApi.setAccessToken(accessToken);
  return accessToken;
}

module.exports = { spotifyApi, ensureAccessToken };

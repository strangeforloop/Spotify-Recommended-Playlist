const express = require("express");
const querystring = require("querystring");
const { spotifyApi } = require("./utils/spotifyClient");

const router = express.Router();

router.get("/login", (req, res) => {
  const scopes = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "playlist-modify-public",
    "playlist-modify-private",
    "user-read-recently-played",
    "playlist-modify-private", 
    "playlist-modify-public",
  ];

  res.redirect(
    "https://accounts.spotify.com/authorize?" +
      querystring.stringify({
        response_type: "code",
        client_id: process.env.SPOTIFY_CLIENT_ID,
        scope: scopes.join(" "),
        redirect_uri: "http://127.0.0.1:3000/callback",
        state: "some-random-string"
      })
  );
});

router.get("/callback", async (req, res) => {
  const code = req.query.code;

  try {
    const data = await spotifyApi.authorizationCodeGrant(code);

    const accessToken = data.body["access_token"];
    const refreshToken = data.body["refresh_token"];

    spotifyApi.setAccessToken(accessToken);
    spotifyApi.setRefreshToken(refreshToken);

    console.log("Access token:", accessToken);
    console.log("Refresh token:", refreshToken);

    res.send(
      "Success! Copy the refresh token from your terminal into .env under SPOTIFY_REFRESH_TOKEN."
    );
  } catch (err) {
    console.error("Error getting tokens:", err);
    res.status(500).send("Error during authentication.");
  }
});

module.exports = router;

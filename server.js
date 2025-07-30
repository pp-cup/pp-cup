const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = 3000;

let participants = [];

app.use(express.static("public"));
app.use(express.json());

app.get("/login", (req, res) => {
  const redirect = `https://osu.ppy.sh/oauth/authorize?client_id=${process.env.OSU_CLIENT_ID}&redirect_uri=${process.env.OSU_REDIRECT_URI}&response_type=code&scope=identify`;
  res.redirect(redirect);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post(
      "https://osu.ppy.sh/oauth/token",
      {
        client_id: process.env.OSU_CLIENT_ID,
        client_secret: process.env.OSU_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.OSU_REDIRECT_URI,
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const { access_token } = tokenRes.data;

    const userRes = await axios.get("https://osu.ppy.sh/api/v2/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id, username, avatar_url, statistics } = userRes.data;

    let existing = participants.find((p) => p.id === id);
    if (!existing) {
      participants.push({
        id,
        username,
        avatar_url,
        pp_at_join: statistics.pp,
        pp_now: statistics.pp,
      });
    }

    res.redirect(`/index.html?user=${encodeURIComponent(username)}`);
  } catch (err) {
    console.error(err);
    res.send("Ошибка авторизации.");
  }
});

app.get("/participants", (req, res) => {
  res.json(participants);
});

// Обновление pp_now каждые 10 минут
setInterval(async () => {
  for (let p of participants) {
    try {
      const userRes = await axios.get(`https://osu.ppy.sh/api/v2/users/${p.id}/osu`);
      p.pp_now = userRes.data.statistics.pp;
    } catch (err) {
      console.error("Ошибка при обновлении PP:", err.message);
    }
  }
}, 10 * 60 * 1000); // каждые 10 минут

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});

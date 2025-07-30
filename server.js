const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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
        pp_now: statistics.pp + 1000,
        pp_clear: 0,
        points: 0,
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

// Функция расчета очков
function calculatePoints(pp_start, pp_end) {
  let points = 0;
  let from = Math.floor(pp_start);
  let to = Math.floor(pp_end);

  let startK = Math.floor(from / 1000);
  let endK = Math.floor(to / 1000);

  for (let k = startK; k <= endK; k++) {
    let lowerBound = k * 1000;
    let upperBound = (k + 1) * 1000;

    let rangeStart = Math.max(from, lowerBound);
    let rangeEnd = Math.min(to, upperBound);

    if (rangeEnd > rangeStart) {
      let gain = rangeEnd - rangeStart;
      points += gain * k;
    }
  }

  return points;
}

// Обновление pp_now каждые 10 минут
setInterval(async () => {
  for (let p of participants) {
    try {
      const userRes = await axios.get(`https://osu.ppy.sh/api/v2/users/${p.id}/osu`);
      p.pp_now = userRes.data.statistics.pp;
      p.pp_clear = p.pp_now - p.pp_at_join;
      p.points = calculatePoints(p.pp_at_join, p.pp_now);
    } catch (err) {
      console.error("Ошибка при обновлении PP:", err.message);
    }
  }
}, 10 * 1000); // каждые 10 минут

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

const ADMIN_KEY = process.env.ADMIN_KEY || "danya1979Dima";

// Админ-обновление вручную
app.post("/admin/update", (req, res) => {
  const { key, id, username, pp_at_join, pp_now } = req.body;
  if (key !== ADMIN_KEY) return res.status(403).send("Access denied");

  const user = participants.find(p => p.id === id);
  if (!user) return res.status(404).send("User not found");

  user.username = username;
  user.pp_at_join = pp_at_join;
  user.pp_now = pp_now+1000;
  user.pp_clear = pp_now - pp_at_join;
  user.points = calculatePoints(pp_at_join, pp_now);

  res.send("Updated");
});

app.get("/admin/delete", (req, res) => {
  const { id, key } = req.query;
  if (key !== ADMIN_KEY) return res.status(403).send("Access denied");

  participants = participants.filter(p => p.id != id);
  res.send("Deleted");
});

app.get("/admin/clear", (req, res) => {
  const { key } = req.query;
  if (key !== ADMIN_KEY) return res.status(403).send("Access denied");

  participants = [];
  res.send("All participants cleared");
});

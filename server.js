const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

let participants = [];

app.use(express.static("public"));
app.use(express.json());

// Проверка переменных окружения
if (!process.env.OSU_CLIENT_ID || !process.env.OSU_CLIENT_SECRET || !process.env.OSU_REDIRECT_URI) {
  console.error("❌ Ошибка: переменные окружения не заданы. Проверь .env или Render → Environment.");
  process.exit(1);
}

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
    const pp = statistics?.pp ?? 0;

    let existing = participants.find((p) => p.id === id);
    if (!existing) {
      participants.push({
        id,
        username,
        avatar_url,
        pp_at_join: pp,
        pp_now: pp,
      });
    }

    res.redirect(`/index.html?id=${id}&username=${encodeURIComponent(username)}&avatar_url=${encodeURIComponent(avatar_url)}&pp=${encodeURIComponent(pp)}`);
  } catch (err) {
    console.error("❌ Ошибка авторизации:", err.response?.data || err.message || err);
    res.status(500).send("Ошибка авторизации.");
  }
});

app.get("/participants", (req, res) => {
  res.json(participants);
});

app.post("/participants/add", (req, res) => {
  const { id, username, avatar_url, pp } = req.body;
  if (!id || !username || !avatar_url || typeof pp !== "number") {
    return res.status(400).send("Неверные данные");
  }

  let exists = participants.find(p => p.id === id);
  if (!exists) {
    participants.push({
      id,
      username,
      avatar_url,
      pp_at_join: pp,
      pp_now: pp,
    });
    return res.status(200).send("Участник добавлен");
  } else {
    return res.status(200).send("Участник уже есть");
  }
});

// Обновление pp_now каждые 10 минут
setInterval(async () => {
  for (let p of participants) {
    try {
      const userRes = await axios.get(`https://osu.ppy.sh/api/v2/users/${p.id}/osu`);
      p.pp_now = userRes.data.statistics.pp ?? p.pp_now;
    } catch (err) {
      console.error("Ошибка при обновлении PP:", err.message);
    }
  }
}, 10 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});

// Админ-функции
const ADMIN_KEY = process.env.ADMIN_KEY || "danya1979Dima";

app.post("/admin/update", (req, res) => {
  const { key, id, username, pp_at_join, pp_now } = req.body;
  if (key !== ADMIN_KEY) return res.status(403).send("Access denied");

  const user = participants.find(p => p.id === id);
  if (!user) return res.status(404).send("User not found");

  user.username = username;
  user.pp_at_join = pp_at_join;
  user.pp_now = pp_now;

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

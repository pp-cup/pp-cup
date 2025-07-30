const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000; // ✅ Render требует использовать process.env.PORT

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
    function calculatepp(ppstart,ppend) {
        if (parseInt((ppend/1000))>parseInt((ppstart/1000))){
        result = (parseInt((ppend/1000)) * 1000-ppstart) * parseInt((ppstart/1000)) + (ppend - parseInt((ppend/1000)) * 1000) * parseInt((ppend/1000));
      }
      else {
        result = (ppend - ppstart) * parseInt((ppend/1000));
      }
      return result;
      }
    let existing = participants.find((p) => p.id === id);
    if (!existing) {
      participants.push({
        id,
        username,
        avatar_url,
        pp_at_join: statistics.pp,
        pp_now: statistics.pp + 1000,
        pp_clear: pp_now - pp_at_join,
        points: calculatepp(pp_at_join,pp_now),
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
      p.pp_clear = p.pp_now - p.pp_at_join;
      p.points = calculatepp(p.pp_at_join,p.pp_now);
      
    } catch (err) {
      console.error("Ошибка при обновлении PP:", err.message);
    }
  }
}, 10 * 60 * 1000); // каждые 10 минут

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

const ADMIN_KEY = process.env.ADMIN_KEY || "danya1979Dima"; // или укажи в Render

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
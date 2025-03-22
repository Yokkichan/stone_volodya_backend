const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let players = []; // Хранилище игроков (имя, очки)

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Отправка рейтинга при подключении
    socket.emit("leaderboard", players);

    // Обновление очков игрока
    socket.on("updateScore", (data) => {
        const player = players.find((p) => p.id === data.id);
        if (player) {
            player.score = data.score;
        } else {
            players.push({ id: data.id, name: data.name, score: data.score });
        }
        io.emit("leaderboard", players); // Обновление рейтинга для всех
    });

    // Событие "Каменный дождь"
    setInterval(() => {
        io.emit("stoneRain", { active: true, duration: 60 }); // 60 секунд
    }, 30 * 60 * 1000); // Каждые 30 минут
});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
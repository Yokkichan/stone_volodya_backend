import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User";

// Загружаем переменные окружения
dotenv.config();

// Проверяем, что MONGO_URI определён
if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not defined in .env file");
    process.exit(1);
}

// Проверяем, что MONGO_URI начинается с mongodb:// или mongodb+srv://
if (!process.env.MONGO_URI.startsWith("mongodb://") && !process.env.MONGO_URI.startsWith("mongodb+srv://")) {
    console.error('MONGO_URI must start with "mongodb://" or "mongodb+srv://"');
    process.exit(1);
}

// Функция для генерации случайного числа
const getRandomInt = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Тестовые данные
const testUsers = [
    // Пользователь 1: Новичок в лиге Pebble
    {
        telegramId: "1001",
        username: "Alice",
        stones: getRandomInt(1000, 5000),
        svcoin: 0,
        league: "Pebble",
        boosts: [
            { name: "Turbo", level: 1, count: 3 },
            { name: "Refills", level: 2, count: 5 },
        ],
        skins: ["default"],
        tasksCompleted: ["join_telegram", "follow_twitter"],
        tonWallet: null,
    },
    // Пользователь 2: Средний игрок в лиге Pebble
    {
        telegramId: "1002",
        username: "Bob",
        stones: getRandomInt(3000, 7000),
        svcoin: 50,
        league: "Pebble",
        boosts: [
            { name: "Turbo", level: 2, count: 2 },
            { name: "Refills", level: 1, count: 3 },
        ],
        skins: ["default", "fire"],
        tasksCompleted: ["join_telegram"],
        tonWallet: "UQ12345...abcde",
    },
    // Пользователь 3: Игрок в лиге Gravel
    {
        telegramId: "1003",
        username: "Charlie",
        stones: getRandomInt(5000, 10000),
        svcoin: 100,
        league: "Gravel",
        boosts: [
            { name: "Turbo", level: 3, count: 1 },
            { name: "Refills", level: 3, count: 2 },
        ],
        skins: ["default", "ice"],
        tasksCompleted: ["join_telegram", "follow_twitter", "invite_friend"],
        tonWallet: null,
    },
    // Пользователь 4: Продвинутый игрок в лиге Gravel
    {
        telegramId: "1004",
        username: "David",
        stones: getRandomInt(8000, 15000),
        svcoin: 200,
        league: "Gravel",
        boosts: [
            { name: "Turbo", level: 4, count: 0 },
            { name: "Refills", level: 2, count: 4 },
        ],
        skins: ["default", "fire", "ice"],
        tasksCompleted: ["join_telegram", "follow_twitter"],
        tonWallet: "UQ67890...fghij",
    },
    // Пользователь 5: Топовый игрок в лиге Cobblestone
    {
        telegramId: "1005",
        username: "Eve",
        stones: getRandomInt(15000, 25000),
        svcoin: 500,
        league: "Cobblestone",
        boosts: [
            { name: "Turbo", level: 5, count: 2 },
            { name: "Refills", level: 5, count: 1 },
        ],
        skins: ["default", "fire", "ice", "legendary"],
        tasksCompleted: ["join_telegram", "follow_twitter", "invite_friend", "airdrop"],
        tonWallet: "UQ54321...klmno",
    },
    // Пользователь 6: Игрок в лиге Boulder
    {
        telegramId: "1006",
        username: "Frank",
        stones: getRandomInt(20000, 35000),
        svcoin: 1000,
        league: "Boulder",
        boosts: [
            { name: "Turbo", level: 6, count: 3 },
            { name: "Refills", level: 4, count: 2 },
        ],
        skins: ["default", "fire", "ice", "legendary", "epic"],
        tasksCompleted: ["join_telegram", "follow_twitter", "invite_friend"],
        tonWallet: null,
    },
];

// Функция для добавления тестовых данных
const seedUsers = async () => {
    try {
        // Подключаемся к MongoDB
        await mongoose.connect(process.env.MONGO_URI!, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log("Connected to MongoDB");

        // Удаляем существующих пользователей
        await User.deleteMany({});
        console.log("Cleared existing users");

        // Добавляем тестовых пользователей
        await User.insertMany(testUsers);
        console.log("Test users added successfully");

        // Закрываем соединение
        await mongoose.connection.close();
        console.log("Disconnected from MongoDB");
    } catch (error) {
        console.error("Error seeding users:", error);
        process.exit(1);
    }
};

// Запускаем скрипт
seedUsers();
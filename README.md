# Документация по бэкенду проекта "Stone Volodya"

## 1. Описание проекта
**Stone Volodya** – это Telegram-игра, в которой пользователи зарабатывают виртуальные "камни" (stones), используют бусты, покупают скины, выполняют задачи и участвуют в реферальной системе. Бэкенд реализован на **Node.js с Express** и использует **MongoDB** для хранения данных пользователей. Также присутствует интеграция с **Telegram WebApp**, WebSocket (Socket.IO) и **TON-блокчейном** для airdrop.

---

## 2. Структура проекта

```plaintext
stone-volodya-backend/
│
├── src/
│   ├── controllers/
│   │   ├── airdropController.ts
│   │   ├── authController.ts
│   │   ├── gameController.ts
│   │   ├── referralController.ts
│   │   ├── leaderboardController.ts
│   │   └── userController.ts
│   │
│   ├── middleware/
│   │   └── authMiddleware.ts
│   │
│   ├── models/
│   │   └── User.ts
│   │
│   ├── routes/
│   │   ├── airdrop.ts
│   │   ├── auth.ts
│   │   ├── game.ts
│   │   ├── leaderboard.ts
│   │   ├── referral.ts
│   │   └── user.ts
│   │
│   ├── scripts/
│   │   ├── resetBoostsMigration.ts
│   │   └── seedUsers.ts
│   │
│   ├── utils/
│   │   ├── telegramAuth.ts
│   │   ├── jwt.ts
│   │   └── referralCode.ts
│   │
│   ├── bot.ts
│   └── server.ts
│
├── dist/
├── node_modules/
│
├── .env
├── package.json
├── package-lock.json
├── tsconfig.json
└── index.js
```

---

## 3. Основные компоненты

### 3.1 Сервер (`server.ts`)
- Запускает **Express-сервер**.
- Настраивает WebSocket **(Socket.IO)** для взаимодействия в реальном времени.
- Подключает **MongoDB**.
- Загружает маршруты и middleware.
- Использует **кэш пользователей**, синхронизируемый каждые 60 секунд.

### 3.2 Бот (`bot.ts`)
- Telegram-бот на **Telegraf**.
- Приветствует новых пользователей и создает их профиль.
- Генерирует и обрабатывает **реферальные коды**.
- Предоставляет ссылку на Telegram WebApp.

### 3.3 Модель пользователя (`models/User.ts`)
- Хранит информацию о пользователе, включая:
  - `telegramId`
  - `stones` (камни)
  - `energy` (энергия)
  - `boosts` (бусты)
  - `skins` (скины)
  - `referralCode` (уникальный код)
  - `invitedFriends` (список приглашенных пользователей)

### 3.4 Контроллеры (`controllers/`)
- **`gameController.ts`** — управление игровой механикой.
- **`airdropController.ts`** — обработка airdrop через TON-блокчейн.
- **`authController.ts`** — аутентификация через JWT (если используется).
- **`userController.ts`** — профиль пользователя и подключение TON-кошелька.
- **`referralController.ts`** — управление реферальной системой.
- **`leaderboardController.ts`** — таблица лидеров.

### 3.5 Маршруты (`routes/`)
- **`/api/game`** — игровые действия.
- **`/api/auth`** — вход в систему.
- **`/api/user`** — профиль и кошелек.
- **`/api/referral`** — рефералы.
- **`/api/leaderboard`** — таблица лидеров.
- **`/api/airdrop`** — получение airdrop.

### 3.6 Утилиты (`utils/`)
- **`telegramAuth.ts`** — проверка Telegram WebApp данных.
- **`jwt.ts`** — генерация JWT-токенов.
- **`referralCode.ts`** — генерация реферальных кодов.

### 3.7 Middleware (`middleware/authMiddleware.ts`)
- Проверяет JWT-токен в заголовке запроса.
- Добавляет `telegramId` в `req.user`.

---

## 4. Как работает система

### 4.1 Регистрация и вход
1. Пользователь запускает **бота** (`/start`) или WebApp.
2. Бот отправляет данные в бэкенд (`authRoutes`), создается профиль.
3. Если у пользователя есть **реферальный код**, бонус начисляется пригласившему его.

### 4.2 Игровой процесс
1. Пользователь зарабатывает **камни** (`updateBalance`).
2. Тратит камни на **бусты** (`applyBoost`), **скины** (`buySkin`).
3. Выполняет **задания** (`completeTask`) для бонусов.

### 4.3 Реферальная система
1. Пользователь получает **реферальный код**.
2. Приглашает друга, который использует этот код.
3. Оба получают **бонус** (камни или энергию).

### 4.4 Airdrop через TON-блокчейн
1. Пользователь **подключает TON-кошелек** (`connectTonWallet`).
2. Запрашивает **airdrop** (`claimAirdrop`).
3. Смарт-контракт отправляет токены на кошелек.

### 4.5 Лидерборд
- Запрос `/api/leaderboard` возвращает **топ игроков по лигам**.
- Лига определяется по количеству **камней**.

### 4.6 WebSocket и кэш
- `userCache` хранит пользователей в памяти.
- WebSocket отправляет **реальные обновления** (например, изменения в лидерборде).

---

## 5. Технологический стек
- **Node.js + TypeScript** — серверная логика.
- **Express** — API маршруты.
- **MongoDB (Mongoose)** — база данных.
- **Telegraf.js** — Telegram-бот.
- **Socket.IO** — WebSocket для обновлений в реальном времени.
- **TON SDK** — работа с блокчейном TON.

---

## 6. Запуск проекта
### 6.1 Установка зависимостей
```sh
npm install
```

### 6.2 Настройка окружения
Создайте `.env` файл с параметрами:
```plaintext
MONGO_URI=mongodb://localhost:27017/stone-volodya
tg_bot_token=your-telegram-bot-token
jwt_secret=your-jwt-secret
```

### 6.3 Запуск сервера
```sh
npm run dev
```

### 6.4 Запуск миграций и начальных данных
```sh    
npm run migrate
npm run seed
```

---

## 7. Заключение
Бэкенд **Stone Volodya** реализует игровой сервер с поддержкой **Telegram WebApp**, **реферальной системы**, **блокчейна TON** и **WebSocket**-обновлений. API легко масштабируется и может быть расширено новыми функциями.


```stone-volodya-backend/
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
│   └── server.js
│
├── node_modules/
│
├── .env
├── package.json
├── package-lock.json
├── tsconfig.json
└── index.js

```

Конечно! Вот краткое объяснение работы твоего проекта `stone-volodya-backend` на основе его структуры и кода:

---

### Общее назначение
Проект — это бэкенд для Telegram-игры "Stone Volodya", где пользователи зарабатывают виртуальные "камни" (stones), используют бусты, покупают скины, выполняют задачи и участвуют в реферальной системе. Он интегрирован с Telegram через WebApp и TON-блокчейн для airdrop.

---

### Основные компоненты и их функции

1. **Сервер (`server.ts`)**
    - Основа проекта: запускает Express-сервер и WebSocket (Socket.IO) для реального времени.
    - Подключает MongoDB для хранения данных пользователей.
    - Обрабатывает HTTP-запросы через маршруты и синхронизирует кэш пользователей с базой каждые 60 секунд.
    - WebSocket используется для обновления данных (например, лидерборда) и отслеживания подключений.

2. **Бот (`bot.ts`)**
    - Telegram-бот на Telegraf, который приветствует пользователя и создает его профиль при первом входе (`/start`).
    - Генерирует реферальный код и обрабатывает реферальные бонусы.
    - Предоставляет ссылку на мини-приложение Telegram.

3. **Модель пользователя (`models/User.ts`)**
    - Определяет структуру данных пользователя в MongoDB: `telegramId`, `stones`, `energy`, `boosts`, `skins`, `referralCode`, и т.д.
    - Хранит информацию о рефералах, лигах и бонусах.

4. **Контроллеры (`controllers/`)**
    - **`gameController.ts`**: Управляет игровой логикой:
        - `updateBalance`: Добавляет камни, обновляет энергию, начисляет реферальные бонусы.
        - `applyBoost`: Применяет бусты (Turbo, Refills и др.), изменяет характеристики (энергия, клики).
        - `buySkin`: Покупает скины за камни.
        - `completeTask`: Завершает задачи и начисляет награды.
    - **`airdropController.ts`**: Обрабатывает airdrop через TON-блокчейн, отправляет токены на кошелек пользователя.
    - **`authController.ts`**: (предположительно) аутентификация через JWT (если есть).
    - **`userController.ts`**: Возвращает профиль и подключает TON-кошелек.
    - **`referralController.ts`**: Управляет реферальной системой.
    - **`leaderboardController.ts`**: Показывает лидерборд по лигам.

5. **Маршруты (`routes/`)**
    - Связывают HTTP-запросы с контроллерами:
        - `/api/game` — игровые действия.
        - `/api/auth` — вход в систему.
        - `/api/user` — профиль и кошелек.
        - `/api/referral` — рефералы.
        - `/api/leaderboard` — таблица лидеров.
        - `/api/airdrop` — получение airdrop.

6. **Утилиты (`utils/`)**
    - **`userUtils.ts`**: Общие функции для обновления пользователя и кэша, форматирования ответа.
    - **`jwt.ts`**: Генерация JWT-токенов для аутентификации.
    - **`referralCode.ts`**: Генерация уникальных реферальных кодов.
    - **`telegramAuth.ts`**: Проверка подлинности данных от Telegram WebApp.

7. **Middleware (`middleware/authMiddleware.ts`)**
    - Проверяет JWT-токен в заголовке запроса, добавляет `telegramId` в `req.user`.

---

### Как это работает
1. **Регистрация/Вход:**
    - Пользователь запускает бота (`/start`) или заходит через WebApp.
    - Бот или `authRoutes` создает нового пользователя с реферальным кодом, если его нет в базе.

2. **Игровой процесс:**
    - Пользователь зарабатывает камни через `updateBalance`, тратит их на бусты (`applyBoost`) или скины (`buySkin`).
    - Выполняет задачи (`completeTask`) для дополнительных наград.
    - Энергия тратится и восстанавливается (логика в бустах).

3. **Рефералы:**
    - Приглашенные друзья приносят бонусы через `updateBalance` или при регистрации.
    - Данные о рефералах хранятся в `invitedFriends`.

4. **Airdrop:**
    - Пользователь подключает TON-кошелек (`connectTonWallet`) и получает токены через `claimAirdrop`.

5. **Лидерборд:**
    - Показывает топ-игроков по лигам (`getLeaderboard`), лиги зависят от количества камней.

6. **Кэш и WebSocket:**
    - `userCache` хранит данные в памяти для быстрого доступа.
    - WebSocket обновляет данные в реальном времени (например, при подключении или запросе лидерборда).

---

### Поток данных
1. Пользователь → Telegram (бот или WebApp) → HTTP-запрос/WebSocket → Сервер.
2. Сервер → MongoDB (чтение/запись) + `userCache` (быстрый доступ).
3. Сервер → TON-блокчейн (airdrop) → Пользователь (ответ).

---

### Ключевые особенности
- **Интеграция с Telegram:** Аутентификация через `initData`, бот для входа.
- **TON-блокчейн:** Airdrop-токены.
- **Реферальная система:** Бонусы за приглашения.
- **Игровая механика:** Камни, энергия, бусты, скины, задачи.
- **Реальное время:** WebSocket для обновлений.

---

Если нужны детали по конкретной части, спроси!
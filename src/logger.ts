import { createLogger, format, transports } from "winston";

const logger = createLogger({
    level: "info", // Минимальный уровень логирования
    format: format.combine(
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}] ${message}`;
        })
    ),
    transports: [
        // Логи в консоль (только info и выше)
        new transports.Console({
            level: "info",
        }),
        // Логи в файл (все уровни, включая debug, для отладки)
        new transports.File({
            filename: "logs/app.log",
            level: "debug",
        }),
        // Ошибки в отдельный файл
        new transports.File({
            filename: "logs/errors.log",
            level: "error",
        }),
    ],
});

export default logger;
type LogContext = Record <string, unknown>;

function writeLog(
    level: "info" | "warn" | "error",
    message : string,
    context : LogContext = {},
) {
    const logEntry = {
        level,
        message,
        ...context,
        timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logEntry));
}

export const logger = {
    info(message: string, context?: LogContext) : void {
        writeLog("info", message, context);
    },
    warn(message: string, context?: LogContext) : void {
        writeLog("warn", message, context);
    },
    error(message: string, context?: LogContext) : void {
        writeLog("error", message, context);
    }
}

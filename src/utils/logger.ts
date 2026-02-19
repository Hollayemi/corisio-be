type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LoggerInterface {
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
}

class Logger implements LoggerInterface {
    private level: LogLevel;
    private levels: Record<LogLevel, number>;

    constructor(level: LogLevel = 'info') {
        this.level = level;
        this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
    }

    private shouldLog(level: LogLevel): boolean {
        return this.levels[level] <= this.levels[this.level];
    }

    private log(level: LogLevel, message: string, ...args: any[]): void {
        if (!this.shouldLog(level)) return;

        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

        if (args.length > 0 && args[0] instanceof Error) {
            console.error(logMessage, args[0]);
        } else {
            console.log(logMessage, ...args);
        }
    }

    error(message: string, ...args: any[]): void {
        this.log('error', message, ...args);
    }

    warn(message: string, ...args: any[]): void {
        this.log('warn', message, ...args);
    }

    info(message: string, ...args: any[]): void {
        this.log('info', message, ...args);
    }

    debug(message: string, ...args: any[]): void {
        this.log('debug', message, ...args);
    }

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    getLevel(): LogLevel {
        return this.level;
    }
}

const logger: Logger = new Logger((process.env.LOG_LEVEL as LogLevel) || 'info');

export { Logger, logger };
export default logger;
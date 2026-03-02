import { loggerConfig, LoggerConfigManager, LogService, LogComponent, LogFlow } from './logger.config';

declare var __DEV__: boolean;

export interface LogMetadata {
    service?: LogService;
    component?: LogComponent;
    function?: string;
    flow?: LogFlow;
    flowId?: string;
    [key: string]: any;
}

type LogLevel = 'info' | 'warn' | 'error';

class StructuredLogger {
    public config = LoggerConfigManager;
    /**
     * Initializes the logger explicitly at the root level.
     * It automatically consumes the hardcoded config map.
     */
    public init() {
        if (typeof __DEV__ !== 'undefined' && !__DEV__) return;

        // The logger is inherently controlled by `loggerConfig`
        // We just execute an empty initialization sequence here as requested.
    }

    private shouldLog(metadata?: LogMetadata): boolean {
        if (typeof __DEV__ !== 'undefined' && !__DEV__) return false;

        if (metadata) {
            // Check for explicit disables or enables in order of specificity
            if (metadata.service && loggerConfig.services[metadata.service] !== undefined) {
                return loggerConfig.services[metadata.service] as boolean;
            }
            if (metadata.component && loggerConfig.components[metadata.component] !== undefined) {
                return loggerConfig.components[metadata.component] as boolean;
            }
            if (metadata.flow && loggerConfig.flows[metadata.flow] !== undefined) {
                return loggerConfig.flows[metadata.flow] as boolean;
            }
        }

        return loggerConfig.defaultEnabled;
    }

    private getTime(): string {
        const now = new Date();
        return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    }

    private formatMessage(level: LogLevel, message: string, metadata?: LogMetadata): string {
        const time = this.getTime();
        let emoji = 'ℹ️';
        if (level === 'warn') emoji = '⚠️';
        if (level === 'error') emoji = '❌';

        let prefix = `[${time}] ${emoji} `;

        if (metadata) {
            const tags: string[] = [];
            if (metadata.service) tags.push(`[${metadata.service}]`);
            if (metadata.component) tags.push(`[${metadata.component}]`);
            if (metadata.flow) tags.push(`[Flow:${metadata.flow}]`);

            if (tags.length > 0) {
                prefix += tags.join('') + ' ';
            }
        }

        return `${prefix}${message}`;
    }

    public info(message: string, metadata?: LogMetadata, ...data: any[]) {
        // Fast path: fully strip execution in production
        if (typeof __DEV__ !== 'undefined' && !__DEV__) return;
        if (!this.shouldLog(metadata)) return;

        const formatted = this.formatMessage('info', message, metadata);
        if (metadata || data.length > 0) {
            console.log(formatted, '\n  ▶ Metadata:', metadata || {}, ...data);
        } else {
            console.log(formatted);
        }
    }

    public warn(message: string, metadata?: LogMetadata, ...data: any[]) {
        if (typeof __DEV__ !== 'undefined' && !__DEV__) return;
        if (!this.shouldLog(metadata)) return;

        const formatted = this.formatMessage('warn', message, metadata);
        if (metadata || data.length > 0) {
            console.warn(formatted, '\n  ▶ Metadata:', metadata || {}, ...data);
        } else {
            console.warn(formatted);
        }
    }

    public error(message: string, metadata?: LogMetadata, ...data: any[]) {
        if (typeof __DEV__ !== 'undefined' && !__DEV__) return;
        if (!this.shouldLog(metadata)) return;

        const formatted = this.formatMessage('error', message, metadata);
        if (metadata || data.length > 0) {
            console.error(formatted, '\n  ▶ Metadata:', metadata || {}, ...data);
        } else {
            console.error(formatted);
        }
    }
}

export const Logger = new StructuredLogger();

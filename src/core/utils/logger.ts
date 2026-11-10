import { redactString, redactValue } from './redact';

type Level = 'debug' | 'info' | 'warn' | 'error';

const enabled: Record<Level, boolean> = {
  debug: __DEV__,
  info: true,
  warn: true,
  error: true,
};

function write(level: Level, message: string, context?: unknown) {
  if (!enabled[level]) return;
  const safeMessage = redactString(message);
  const safeContext = context === undefined ? undefined : redactValue(context);
  const line = `[laila:${level}] ${safeMessage}`;
  if (level === 'error') {
    console.error(line, safeContext ?? '');
  } else if (level === 'warn') {
    console.warn(line, safeContext ?? '');
  } else {
    console.log(line, safeContext ?? '');
  }
}

export const logger = {
  debug: (message: string, context?: unknown) => write('debug', message, context),
  info: (message: string, context?: unknown) => write('info', message, context),
  warn: (message: string, context?: unknown) => write('warn', message, context),
  error: (message: string, context?: unknown) => write('error', message, context),
};

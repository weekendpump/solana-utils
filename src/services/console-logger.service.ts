import { BaseLoggerService } from './base-logger.service';

export class ConsoleLoggerService extends BaseLoggerService {
  readonly displayLogLevel = 7;
  readonly addTimestamp = true;

  debug(message: unknown, ...params: unknown[]) {
    // tslint:disable-next-line:no-console
    console.debug(message, params);
  }

  log(message: unknown, ...params: unknown[]) {
    console.log(message, params);
  }

  /** lower levels are more important */
  logAt(level: number, ...params: unknown[]) {
    if (level <= this.displayLogLevel) {
      if (this.addTimestamp) {
        params.unshift(this.timestamp());
      }

      if (level < 2) {
        console.error(...params);
      } else if (level < 4) {
        console.warn(...params);
      } else if (level < 6) {
        console.log(...params);
      }
      console.debug(...params);
    }
  }

  error(message: unknown, ...params: unknown[]) {
    console.error(message, params);
  }

  none(message: unknown, ...params: unknown[]) {
    // not needed, only to take care of the warning
    return [message, params];
  }
}

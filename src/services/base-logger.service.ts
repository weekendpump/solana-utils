export abstract class BaseLoggerService {
  readonly displayLogLevel = 5;
  readonly addTimestamp = true;

  abstract log(message: unknown, ...params: unknown[]): void;
  abstract logAt(level: number, ...params: unknown[]): void;

  protected timestamp(showMs = false): string {
    const d = new Date();
    return `[${d.toISOString()}${showMs ? " " + d.getMilliseconds() : ""}]`;
  }
}

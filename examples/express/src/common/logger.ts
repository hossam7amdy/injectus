export abstract class Logger {
  abstract info(message: string): void;
  abstract error(message: string, err?: unknown): void;
}

export class ConsoleLogger extends Logger {
  info(message: string): void {
    console.log(message);
  }

  error(message: string, err?: unknown): void {
    if (err !== undefined) {
      console.error(message, err);
    } else {
      console.error(message);
    }
  }
}

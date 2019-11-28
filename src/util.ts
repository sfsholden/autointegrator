import { Application, Context } from 'probot';
import { LoggerWithTarget } from 'probot/lib/wrap-logger';
import { execSync } from 'child_process';

type ConfigFile = {
  triggers: {
    [triggerBranch: string]: string[];
  };
};

export class Config {
  public static readonly FILE_NAME = 'autointegrator.yml';
  private context: Context;

  constructor(context: Context) {
    this.context = context;
  }

  public async get(): Promise<ConfigFile> {
    return Object.assign(
      { triggers: {} },
      await this.context.config(Config.FILE_NAME)
    );
  }
}

export class Logger {
  private rootLogTarget: LoggerWithTarget;
  private installationId: string;
  private secrets = new Set<string>();

  constructor(app: Application, context: Context) {
    this.rootLogTarget = app.log;
    this.installationId = context.payload.installation.id;
    this.secrets = new Set();
  }

  public info(message: string) {
    this.doLog(message, this.rootLogTarget.info);
  }

  public warn(message: string) {
    this.doLog(message, this.rootLogTarget.warn);
  }

  public error(message: string) {
    this.doLog(message, this.rootLogTarget.error);
  }

  /**
   * Mark tokens as sensitive to redact from logging messages
   * @param  {...strings} tokens sensitive tokens
   */
  public addSecret(...tokens: string[]) {
    tokens.map(t => this.secrets.add(t));
  }

  private doLog(message: string, logTarget: LoggerWithTarget) {
    let msg = message;
    if (this.secrets.size > 0) {
      msg = this.redact(msg);
    }
    logTarget(`[${this.installationId}] ${msg}`);
  }

  private redact(message: string): string {
    const pattern = Array.from(this.secrets).reduce((acc, t, i) => {
      acc += t;
      acc += i < this.secrets.size - 1 ? '|' : ')';
      return acc;
    }, '(');
    return message.replace(new RegExp(pattern, 'g'), '*');
  }
}

/**
 * Run shell command
 * @param command Shell command to run
 * @returns stdio
 * @throws Error with stderr as message
 */
export const run = (command: string) => {
  try {
    return execSync(command, { stdio: 'pipe' }).toString();
  } catch (e) {
    throw new Error(Buffer.from(e.stderr).toString());
  }
};

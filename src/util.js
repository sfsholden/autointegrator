const { execSync } = require('child_process');

class Logger {
  constructor(app, context) {
    this.log = app.log;
    this.installationId = context.payload.installation.id;
    this.secrets = new Set();
  }

  info(message) {
    this.log(`[${this.installationId}] ${this._redact(message)}`);
  }

  warn(message) {
    this.log.warn(`[${this.installationId}] ${this._redact(message)}`);
  }

  error(message) {
    this.log.error(`[${this.installationId}] ${this._redact(message)}`);
  }

  /**
   * Mark tokens as sensitive to redact from logging messages
   * @param  {...strings} tokens sensitive tokens
   */
  addSecret(...tokens) {
    tokens.map(t => this.secrets.add(t));
  }

  _redact(message) {
    const pattern = Array.from(this.secrets).reduce((acc, t, i) => {
      acc += t;
      acc += i < this.secrets.size - 1 ? '|' : ')';
      return acc;
    }, '(');
    return message.replace(new RegExp(pattern, 'g'), '*');
  }
}

module.exports = {
  Logger,
  run: command => {
    try {
      return execSync(command, { stdio: 'pipe' });
    } catch (e) {
      throw new Error(Buffer.from(e.stderr).toString());
    }
  }
};

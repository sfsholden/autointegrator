const { execSync } = require('child_process');

module.exports = {
  /**
   * Redact sensitive tokens from messages. Used primarily for logging.
   * @example
   * const redactor = new Redactor();
   * redactor.add('1234', 'sensitive');
   * redactor.format('a sensitive token 1234') => 'a * token *'
   */
  Redactor: class Redactor {
    constructor() {
      this.tokens = new Set();
    }

    add(...tokens) {
      tokens.map(t => this.tokens.add(t));
    }

    /**
     * Redact the tokens set by `add` from the given message
     * @param {string} message
     */
    format(message) {
      const pattern = Array.from(this.tokens).reduce((acc, t, i) => {
        acc += t;
        acc += i < this.tokens.size - 1 ? '|' : ')';
        return acc;
      }, '(');
      return message.replace(new RegExp(pattern, 'g'), '*');
    }
  },
  run: command => {
    try {
      return execSync(command, { stdio: 'pipe' });
    } catch (e) {
      throw new Error(Buffer.from(e.stderr).toString());
    }
  }
};

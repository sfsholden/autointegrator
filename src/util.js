const { execSync } = require('child_process');

module.exports = {
  Redactor: class Redactor {
    constructor() {
      this.tokens = new Set();
    }

    add(...tokens) {
      tokens.map(t => this.tokens.add(t));
    }

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

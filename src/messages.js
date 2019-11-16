const { format } = require('util');

const messages = {
  CloneUrl: 'https://sfdx-backport:%s@github.com/%s/%s',
  CommentPortRequest: 'Thanks @%s 👍, a port PR for %s was created [here](%s).',
  CommentPortRequestFailed: 'Had some trouble making a port PR for %s 😓.',
  CommentCherryPickFailed:
    'Heads up @%s, merge conflicts prevented a successful cherry pick. You can ' +
    'give it a shot yourself and resolve the conflicts with the following steps:\n' +
    '```\ngit pull %s\ngit cherry-pick %s```',
  LogCherryPickFailed: 'Cherry pick failed due to merge conflicts',
  PortRequestBody: 'Port changes made in #%s to the %s branch',
  PortRequestTitle: 'Port #%s to %s branch'
};

module.exports = {
  get: (key, params) => {
    if (messages[key]) {
      if (params) {
        return format(messages[key], params);
      }
      return format(messages[key]);
    }
    throw new Error(`Missing message for key ${key}`);
  }
};

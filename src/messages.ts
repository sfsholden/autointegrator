import { format } from 'util';

const messages: { [key: string]: string } = {
  CloneUrl: 'https://sfdx-backport:%s@github.com/%s/%s',
  CommentCherryPickFailed:
    '❗️Heads up @%s, merge conflicts prevented a successful cherry pick. You can ' +
    'try it out yourself and manually resolve the conflicts with the following steps:\n' +
    '```\ngit pull %s\ngit cherry-pick %s\n```',
  CommentMissingTargetBranch:
    '❗️The branch `%s` does not exist on the repo. Make the issue labels for the branches ' +
    'to port to are spelled correctly.',
  CommentNoDiff:
    '⚠️ The changes in the cherry-pick are already present in the `%s` branch. No port necessary.',
  CommentPortRequest:
    '✅ Thanks @%s, a port PR for the `%s` branch was created [here](%s).',
  CommentPortRequestFailed: '❗️Had some trouble making a port PR 😓.',
  LogCherryPickFailed: 'Cherry pick failed due to merge conflicts',
  LogMissingTargetBranch: 'Target branches were missing from the repository',
  LogNoDiff: 'No differences with target branch and cherry-pick',
  PortRequestBody: 'Port changes made in #%s to the `%s` branch',
  PortRequestTitle: 'Port #%s to the %s branch'
};

export const getMessage = (key: string, params?: string[]) => {
  if (messages[key]) {
    if (params) {
      return format(messages[key], ...params);
    }
    return format(messages[key]);
  }
  throw new Error(`Missing message for key ${key}`);
};

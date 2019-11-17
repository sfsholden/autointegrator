const messages = require('./messages');
const BranchPort = require('./branchPort');
const { BASE, TRIGGER } = require('./constants');
const { Logger } = require('./util');

/**
 * @param {import('probot').Application} app
 */
module.exports = app => {
  app.log("We're live");

  app.on('pull_request.closed', async context => {
    const port = new BranchPort(context);
    const logger = new Logger(app, context);
    // mark branches and repo info as sensitive
    logger.addSecret(...Object.values(context.repo()), BASE, TRIGGER);

    const { login: sender } = context.payload.sender;
    const { pull_request: closedPr } = context.payload;
    const { number } = closedPr;

    if (closedPr.merged && closedPr.base.ref === TRIGGER) {
      try {
        logger.info('Setting up the repository');
        const accessToken = await port.fetchToken(app);
        logger.addSecret(accessToken);
        await port.setupRepo(accessToken);

        logger.info('Creating the port branch from the base');
        const portBranchName = port.createPortBranch();

        logger.info('Sending the port pull request');
        const portPr = await port.createPortRequest(portBranchName);
        port.commentOnPr({
          number,
          body: messages.get('CommentPortRequest', [
            sender,
            BASE,
            portPr.data.html_url
          ])
        });
      } catch (e) {
        let body;
        if (e.name === 'ConflictException') {
          body = messages.get('CommentCherryPickFailed', [
            sender,
            e.portBranchName,
            closedPr.merge_commit_sha
          ]);
          logger.warn(messages.get('LogCherryPickFailed'));
        } else {
          logger.error(e.stack);
          body = messages.get('CommentPortRequestFailed', [BASE]);
        }
        port.commentOnPr({ number, body });
      } finally {
        logger.info('Cleaning up');
        port.cleanUp();
      }
    }
  });
};

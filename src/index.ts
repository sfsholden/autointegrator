import { Application, Probot } from 'probot';
import { getMessage } from './messages';
import BranchPort from './branchPort';
import { BASE, TRIGGER } from './constants';
import { Logger } from './util';

Probot.run((app: Application) => {
  console.log('---------------\nAutointegrator\n---------------');

  app.on('pull_request.closed', async context => {
    const port = new BranchPort(context);
    const logger = new Logger(app, context);
    // mark branches and repo info as sensitive
    logger.addSecret(...Object.values<string>(context.repo()), BASE, TRIGGER);

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
        const portPrLink = await port.createPortRequest(portBranchName);
        port.commentOnPr({
          number,
          body: getMessage('CommentPortRequest', [sender, BASE, portPrLink])
        });
      } catch (e) {
        let body;
        if (e.name === 'ConflictException') {
          body = getMessage('CommentCherryPickFailed', [
            sender,
            e.portBranchName,
            closedPr.merge_commit_sha
          ]);
          logger.warn(getMessage('LogCherryPickFailed'));
        } else {
          logger.error(e.stack);
          body = getMessage('CommentPortRequestFailed', [BASE]);
        }
        port.commentOnPr({ number, body });
      } finally {
        logger.info('Cleaning up');
        port.cleanUp();
      }
    }
  });
});

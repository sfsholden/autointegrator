import { Application, Probot } from 'probot';
import { getMessage } from './messages';
import BranchPort from './branchPort';
import { Logger, Config } from './util';

export const app = (app: Application) => {
  app.on('pull_request.opened', async context => {
    const config = await new Config(context).get();
    const { pull_request: openedPr } = context.payload;
    const targetBranches = new Set(config.triggers[openedPr.base.ref]);

    if (!context.isBot && targetBranches.size > 0) {
      const { number: issue_number } = context.payload;
      const { owner, repo } = context.repo();

      await context.github.issues.addLabels({
        owner,
        repo,
        issue_number,
        labels: Array.from(targetBranches).map(b => `port:${b}`)
      });
    }

    // @ts-ignore
    if (context.payload.testDone) {
      // @ts-ignore
      context.payload.testDone();
    }
  });

  app.on('pull_request.closed', async context => {
    const port = new BranchPort(context);
    const logger = new Logger(app, context);
    const config = await new Config(context).get();
    logger.addSecret(
      ...Object.values<string>(context.repo()),
      ...Object.keys(config.triggers)
    );

    const { login: sender } = context.payload.sender;
    const { pull_request: closedPr } = context.payload;
    const { number } = closedPr;

    const targetBranches = await port.getTargetBranches();
    logger.addSecret(...targetBranches);

    if (closedPr.merged && targetBranches.length > 0) {
      try {
        logger.info('Setting up the repository');
        const accessToken = await port.fetchToken(app);
        logger.addSecret(accessToken);
        await port.setupRepo(targetBranches, accessToken);

        logger.info('Creating the port branch from the base');
        const portBranchName = await port.createPortBranch(targetBranches);

        logger.info('Sending the port pull request');
        const portPrLink = await port.createPortRequest(
          targetBranches,
          portBranchName
        );
        port.commentOnPr({
          number,
          body: getMessage('CommentPortRequest', [
            sender,
            targetBranches[0],
            portPrLink
          ])
        });
      } catch (e) {
        let body;
        switch (e.name) {
          case 'ConflictException':
            body = getMessage('CommentCherryPickFailed', [
              sender,
              e.portBranchName,
              closedPr.merge_commit_sha
            ]);
            logger.warn(getMessage('LogCherryPickFailed'));
            break;
          case 'MissingTargetException':
            body = getMessage('CommentMissingTargetBranch', [
              e.targetBranchName
            ]);
            logger.warn(getMessage('LogMissingTargetBranch'));
            break;
          case 'NoDiffException':
            body = getMessage('CommentNoDiff', [e.targetBranchName]);
            logger.warn('LogNoDiff');
            break;
          default:
            logger.error(e.stack);
            body = getMessage('CommentPortRequestFailed');
        }
        if (body) {
          port.commentOnPr({ number, body });
        }
      } finally {
        logger.info('Cleaning up');
        port.cleanUp();
      }
    }
  });
};

Probot.run(app);

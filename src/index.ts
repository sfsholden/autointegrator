import { Application, Probot } from 'probot';
import { getMessage } from './messages';
import BranchPort from './branchPort';
import { Logger, Config } from './util';

Probot.run((app: Application) => {
  console.log('---------------\nAutointegrator\n---------------');

  app.on('pull_request.opened', async context => {
    const config = await Config.get(context);
    const { pull_request: openedPr } = context.payload;
    const targetBranches = config.triggers[openedPr.base.ref] || [];

    if (!context.isBot && targetBranches.length > 0) {
      const { number: issue_number } = context.payload;
      const { owner, repo } = context.repo();
      context.github.issues.addLabels({
        owner,
        repo,
        issue_number,
        labels: [`port:${targetBranches[0]}`]
      });
    }
  });

  app.on('pull_request.closed', async context => {
    const port = new BranchPort(context);
    const logger = new Logger(app, context);
    const config = await Config.get(context);
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
});

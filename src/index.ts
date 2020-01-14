import { Application, Probot } from 'probot';
import { getMessage } from './messages';
import BranchPort from './branchPort';
import { Logger, Config } from './util';

Probot.run((app: Application) => {
  app.on('pull_request.opened', async context => {
    const config = await new Config(context).get();
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
        await port.cloneRepo(accessToken);

        for (const branch of targetBranches) {
          try {
            const portBranchName = await port.createPortBranch(branch);
            logger.info('Creating the port branch from the base');

            logger.info('Sending the port pull request');
            const portPrLink = await port.createPortRequest(
              branch,
              portBranchName
            );
            port.commentOnPr({
              number,
              body: getMessage('CommentPortRequest', [
                sender,
                branch,
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
                throw e;
            }
            if (body) {
              port.commentOnPr({ number, body });
            }
          }
        }
      } catch (e) {
        logger.error(e.stack);
        port.commentOnPr({
          number,
          body: getMessage('CommentPortRequestFailed')
        });
      } finally {
        logger.info('Cleaning up');
        port.cleanUp();
      }
    }
  });
});

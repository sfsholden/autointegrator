const { join } = require('path');
const { Redactor, run } = require('./util');
const messages = require('./messages');

const BASE = 'develop';
const TRIGGER = 'master';
const TMP_LOCATION = './tmp';

/**
 * @param {import('probot').Application} app
 */
module.exports = app => {
  // TODO: don't use a global redactor
  let redactor;

  app.log("We're live");

  app.on('pull_request.closed', async context => {
    initRedactor(context);

    const { login: sender } = context.payload.sender;
    const { pull_request: closedPr } = context.payload;
    const { number } = closedPr;

    if (closedPr.merged && closedPr.base.ref === TRIGGER) {
      try {
        app.log('Setting up the repository');
        await setupRepo(context);

        app.log('Creating the port branch from the base');
        const portBranch = createPortBranch(context.payload.pull_request);

        app.log('Sending the port pull request');
        const portPr = await createPortRequest(context, portBranch);
        commentOnPr(context, {
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
            e.portBranch,
            closedPr.merge_commit_sha
          ]);
          app.log.warn(messages.get('LogCherryPickFailed'));
        } else {
          app.log.error(redactor.format(e.stack));
          body = messages.get('CommentPortRequestFailed', [BASE]);
        }
        commentOnPr(context, { number, body });
      } finally {
        cleanUp(context);
      }
    }
  });

  const initRedactor = context => {
    redactor = new Redactor();
    redactor.add(...Object.values(context.repo()), TRIGGER, BASE);
  };

  const fetchToken = async context => {
    const github = await app.auth();
    const resp = await github.apps.createInstallationToken({
      installation_id: context.payload.installation.id
    });
    if (resp.status === 201) {
      redactor.add(resp.data.token);
      return resp.data.token;
    }
    throw new Error('Error fetching access token');
  };

  const setupRepo = async context => {
    const token = await fetchToken(context);
    const { owner, repo } = context.repo();
    const url = messages.get('CloneUrl', [token, owner, repo]);
    const repoPath = join(TMP_LOCATION, `${owner}-${repo}`);
    run(`git clone ${url} ${repoPath}`);
    process.chdir(repoPath);
    run(`git remote add upstream ${url}`);
    run(`git fetch upstream ${BASE}`);
  };

  const createPortBranch = pr => {
    const head = `${BASE}-port-${pr.number}`;
    try {
      run(`git checkout upstream/${BASE}`);
      run(`git checkout -b ${head}`);
      run(`git cherry-pick ${pr.merge_commit_sha}`);
      run(`git push upstream ${head}`);
    } catch (e) {
      if (e.message.includes('after resolving the conflicts')) {
        e.name = 'ConflictException';
        e.portBranch = head;
        // still push the port branch for manual merging
        run(`git push upstream ${head}`);
      }
      throw e;
    }
    return head;
  };

  const createPortRequest = async (context, head) => {
    const { owner, repo } = context.repo();
    const { number } = context.payload.pull_request;
    const pr = await context.github.pulls.create({
      owner,
      repo,
      title: messages.get('PortRequestTitle', [number, BASE]),
      head,
      base: BASE,
      body: messages.get('PortRequestBody', [number, BASE])
    });
    return pr;
  };

  const commentOnPr = async (context, options) => {
    const { owner, repo } = context.repo();
    await context.github.issues.createComment({
      owner,
      repo,
      issue_number: options.number,
      body: options.body
    });
  };

  const cleanUp = context => {
    app.log('Cleaning up');
    const { owner, repo } = context.repo();
    process.chdir(join(__dirname, '..'));
    run(`rm -rf ${join(TMP_LOCATION, `${owner}-${repo}`)}`);
  };
};

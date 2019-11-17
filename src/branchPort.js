const { join } = require('path');
const { existsSync } = require('fs');
const { run } = require('./util');
const messages = require('./messages');
const { BASE, TMP_LOCATION } = require('./constants');

class BranchPort {
  constructor(context) {
    this.context = context;
  }

  async fetchToken(app) {
    const github = await app.auth();
    const resp = await github.apps.createInstallationToken({
      installation_id: this.context.payload.installation.id
    });
    if (resp.status === 201) {
      return resp.data.token;
    }
    throw new Error('Error fetching access token');
  }

  async setupRepo(accessToken) {
    const { owner, repo } = this.context.repo();
    const url = messages.get('CloneUrl', [accessToken, owner, repo]);
    const repoPath = join(TMP_LOCATION, `${owner}-${repo}`);
    run(`git clone ${url} ${repoPath}`);
    process.chdir(repoPath);
    run(`git remote add upstream ${url}`);
    run(`git fetch upstream ${BASE}`);
  }

  createPortBranch() {
    const { number, merge_commit_sha } = this.context.payload.pull_request;
    const head = `${BASE}-port-${number}`;
    try {
      run(`git checkout upstream/${BASE}`);
      run(`git checkout -b ${head}`);
      run(`git cherry-pick ${merge_commit_sha}`);
      run(`git push upstream ${head}`);
    } catch (e) {
      if (e.message.includes('after resolving the conflicts')) {
        e.name = 'ConflictException';
        e.portBranchName = head;
        // still push the port branch for manual merging
        run(`git push upstream ${head}`);
      }
      throw e;
    }
    return head;
  }

  async createPortRequest(head) {
    const { owner, repo } = this.context.repo();
    const { number } = this.context.payload.pull_request;
    const pr = await this.context.github.pulls.create({
      owner,
      repo,
      title: messages.get('PortRequestTitle', [number, BASE]),
      head,
      base: BASE,
      body: messages.get('PortRequestBody', [number, BASE])
    });
    return pr;
  }

  async commentOnPr(options) {
    const { owner, repo } = this.context.repo();
    await this.context.github.issues.createComment({
      owner,
      repo,
      issue_number: options.number,
      body: options.body
    });
  }

  cleanUp() {
    const { owner, repo } = this.context.repo();
    process.chdir(join(__dirname, '..'));
    const repoPath = join(TMP_LOCATION, `${owner}-${repo}`);
    if (existsSync(repoPath)) {
      run(`rm -rf ${repoPath}`);
    }
  }
}

module.exports = BranchPort;

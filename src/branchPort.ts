import { WebhookPayloadPullRequest } from '@octokit/webhooks';
import { Application, Context } from 'probot';
import { join } from 'path';
import { existsSync } from 'fs';
import { run } from './util';
import { getMessage } from './messages';
import { BASE, TMP_LOCATION } from './constants';

type CommentOptions = {
  number: number;
  body: string;
};

export default class BranchPort {
  private context: Context<WebhookPayloadPullRequest>;

  constructor(context: Context<WebhookPayloadPullRequest>) {
    this.context = context;
  }

  public async fetchToken(app: Application): Promise<string> {
    const github = await app.auth();
    const resp = await github.apps.createInstallationToken({
      // @ts-ignore this value does exist, just not typed for whatever reason
      installation_id: this.context.payload.installation.id
    });
    if (resp.status === 201) {
      return resp.data.token;
    }
    throw new Error('Error fetching access token');
  }

  public async setupRepo(accessToken: string) {
    const { owner, repo } = this.context.repo();
    const url = getMessage('CloneUrl', [accessToken, owner, repo]);
    const repoPath = join(TMP_LOCATION, `${owner}-${repo}`);
    run(`git clone ${url} ${repoPath}`);
    process.chdir(repoPath);
    run(`git remote add upstream ${url}`);
    run(`git fetch upstream ${BASE}`);
  }

  public createPortBranch() {
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

  async createPortRequest(head: string): Promise<string> {
    const { owner, repo } = this.context.repo();
    const number = String(this.context.payload.pull_request.number);
    const pr = await this.context.github.pulls.create({
      owner,
      repo,
      title: getMessage('PortRequestTitle', [number, BASE]),
      head,
      base: BASE,
      body: getMessage('PortRequestBody', [number, BASE])
    });
    return pr.data.html_url;
  }

  public async commentOnPr(options: CommentOptions) {
    const { owner, repo } = this.context.repo();
    await this.context.github.issues.createComment({
      owner,
      repo,
      issue_number: options.number,
      body: options.body
    });
  }

  public cleanUp() {
    const { owner, repo } = this.context.repo();
    process.chdir(join(__dirname, '..'));
    const repoPath = join(TMP_LOCATION, `${owner}-${repo}`);
    if (existsSync(repoPath)) {
      run(`rm -rf ${repoPath}`);
    }
  }
}

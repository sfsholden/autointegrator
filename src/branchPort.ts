import { WebhookPayloadPullRequest } from '@octokit/webhooks';
import { Application, Context } from 'probot';
import { join } from 'path';
import { existsSync } from 'fs';
import { run } from './util';
import { getMessage } from './messages';

export const TMP_LOCATION = './tmp';

export type CommentOptions = {
  number: number;
  body: string;
};

export default class BranchPort {
  private context: Context<WebhookPayloadPullRequest>;
  private targetBranches?: string[];

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

  public async setupRepo(targets: string[], accessToken: string) {
    const { owner, repo } = this.context.repo();
    const url = getMessage('CloneUrl', [accessToken, owner, repo]);
    const repoPath = join(TMP_LOCATION, `${owner}-${repo}`);
    try {
      run(`git clone ${url} ${repoPath}`);
      process.chdir(repoPath);
      run(`git remote add upstream ${url}`);
      run(`git fetch upstream ${targets[0]}`);
    } catch (e) {
      if (e.message.includes("Couldn't find remote ref")) {
        e.name = 'MissingTargetException';
        e.targetBranchName = targets[0];
      }
      throw e;
    }
  }

  public createPortBranch(targets: string[]): string {
    const { number, merge_commit_sha } = this.context.payload.pull_request;
    const head = `${targets[0]}-port-${number}`;
    try {
      run(`git checkout upstream/${targets[0]}`);
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

  public async createPortRequest(
    targets: string[],
    head: string
  ): Promise<string> {
    const { owner, repo } = this.context.repo();
    const number = String(this.context.payload.pull_request.number);
    const pr = await this.context.github.pulls.create({
      owner,
      repo,
      title: getMessage('PortRequestTitle', [number, targets[0]]),
      head,
      base: targets[0],
      body: getMessage('PortRequestBody', [number, targets[0]])
    });
    return pr.data.html_url;
  }

  public commentOnPr(options: CommentOptions) {
    const { owner, repo } = this.context.repo();
    this.context.github.issues.createComment({
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

  public async getTargetBranches() {
    if (!this.targetBranches) {
      this.targetBranches = [];
      const { owner, repo } = this.context.repo();
      const labels = await this.context.github.issues.listLabelsOnIssue({
        owner,
        repo,
        issue_number: this.context.payload.pull_request.number
      });

      for (const label of labels.data) {
        const parts = label.name.split('port:');
        if (parts.length === 2 && parts[1]) {
          this.targetBranches.push(parts[1]);
        }
      }
    }

    return this.targetBranches;
  }
}

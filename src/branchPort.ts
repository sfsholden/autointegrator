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

  public async cloneRepo(accessToken: string) {
    const { owner, repo } = this.context.repo();
    const url = getMessage('CloneUrl', [accessToken, owner, repo]);
    const repoPath = join(TMP_LOCATION, `${owner}-${repo}`);
    run(`git clone ${url} ${repoPath}`);
    process.chdir(repoPath);
    run(`git remote add upstream ${url}`);
    // Assuming we're just working with merge commits here
    const { merge_commit_sha } = this.context.payload.pull_request;
    const { author } = (
      await this.context.github.repos.getCommit({
        owner,
        repo,
        ref: (merge_commit_sha as unknown) as string
      })
    ).data.commit;
    run(`git config user.name "${author.name}"`);
    run(`git config user.email "${author.email}"`);
  }

  public createPortBranch(target: string): string {
    const { number, merge_commit_sha } = this.context.payload.pull_request;
    const head = `${target}-port-${number}`;
    try {
      run(`git fetch upstream ${target}`);
      run(`git checkout upstream/${target}`);
      run(`git checkout -b ${head}`);
      run(`git cherry-pick ${merge_commit_sha}`);
      run(`git push upstream ${head}`);
    } catch (e) {
      if (e.message.includes("Couldn't find remote ref")) {
        e.name = 'MissingTargetException';
        e.targetBranchName = target;
      } else if (e.message.includes('after resolving the conflicts')) {
        e.name = 'ConflictException';
        e.portBranchName = head;
        // still push the port branch for manual merging
        run(`git push upstream ${head}`);
      } else if (e.message.includes('The previous cherry-pick is now empty')) {
        e.name = 'NoDiffException';
        e.targetBranchName = target;
      }
      throw e;
    }
    return head;
  }

  public async createPortRequest(
    target: string,
    head: string
  ): Promise<string> {
    const { owner, repo } = this.context.repo();
    const number = String(this.context.payload.pull_request.number);
    const pr = await this.context.github.pulls.create({
      owner,
      repo,
      title: getMessage('PortRequestTitle', [number, target]),
      head,
      base: target,
      body: getMessage('PortRequestBody', [number, target])
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

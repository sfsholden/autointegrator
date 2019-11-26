/**
 * Helper for building a mock context
 */
export class ContextBuilder {
  private context: any;

  constructor() {
    this.context = {};
  }

  public withGithub(github: any) {
    this.context.github = github;
    return this;
  }

  public withLabels(issue: number, labels: string[]) {
    const data = labels.map(label => ({ name: label }));
    this.withGithub({
      issues: {
        listLabelsOnIssue: jest.fn().mockImplementation(options => {
          if (options.issue_number === issue) {
            return { data };
          }
          return {};
        })
      }
    });
    return this;
  }

  public withPayload(payload: any) {
    this.context.payload = payload;
    return this;
  }

  public withRepo() {
    this.context.repo = () => ({ owner: 'testOwner', repo: 'testRepo' });
    return this;
  }

  public build() {
    return this.context;
  }
}

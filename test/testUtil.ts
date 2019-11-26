/**
 * Helper for building a mock context
 */
export class ContextBuilder {
  private context: any;

  constructor() {
    this.context = {};
  }

  public withRepo() {
    this.context.repo = () => ({ owner: 'testOwner', repo: 'testRepo' });
    return this;
  }

  public withPayload(payload: any) {
    this.context.payload = payload;
    return this;
  }

  public withGithub(github: any) {
    this.context.github = github;
    return this;
  }

  public build() {
    return this.context;
  }
}

import { createSandbox } from 'sinon';
import * as util from '../src/util';
import BranchPort from '../src/branchPort';
import { Context } from 'probot';
import { BASE } from '../src/constants';

describe('BranchPort', () => {
  const sandbox = createSandbox();

  afterEach(() => sandbox.restore());

  describe('createPortBranch', () => {
    it('Should run correct commands in order', async () => {
      const run = sandbox.stub(util, 'run');
      const port = new BranchPort({
        payload: {
          pull_request: { number: 123, merge_commit_sha: 'testsha' }
        }
      } as Context);

      port.createPortBranch();

      const portBranchName = `${BASE}-port-123`;
      expect(run.getCall(0).args[0]).toEqual(`git checkout upstream/${BASE}`);
      expect(run.getCall(1).args[0]).toEqual(
        `git checkout -b ${portBranchName}`
      );
      expect(run.getCall(2).args[0]).toEqual(`git cherry-pick testsha`);
      expect(run.getCall(3).args[0]).toEqual(
        `git push upstream ${portBranchName}`
      );
    });
  });
});

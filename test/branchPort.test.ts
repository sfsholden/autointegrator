import { createSandbox, SinonStub } from 'sinon';
import * as util from '../src/util';
import BranchPort from '../src/branchPort';
import { Context } from 'probot';
import { BASE } from '../src/constants';

describe('BranchPort', () => {
  const sandbox = createSandbox();

  afterEach(() => sandbox.restore());

  describe('createPortBranch', () => {
    let port: BranchPort;
    let run: SinonStub<[string], string>;
    const portBranchName = `${BASE}-port-123`;

    beforeEach(() => {
      run = sandbox.stub(util, 'run');
      port = new BranchPort({
        payload: {
          pull_request: { number: 123, merge_commit_sha: 'testsha' }
        }
      } as Context);
    });

    it('Should run correct commands in order', () => {
      port.createPortBranch();

      const calls = run.getCalls();
      expect(calls[0].args[0]).toEqual(`git checkout upstream/${BASE}`);
      expect(calls[1].args[0]).toEqual(`git checkout -b ${portBranchName}`);
      expect(calls[2].args[0]).toEqual(`git cherry-pick testsha`);
      expect(calls[3].args[0]).toEqual(`git push upstream ${portBranchName}`);
    });

    it('Should handle cherry-pick conflict error', () => {
      const error = new Error('after resolving the conflicts');
      run.withArgs('git cherry-pick testsha').throws(error);

      try {
        port.createPortBranch();
        fail('Should have thrown an error');
      } catch (e) {
        expect(e.name).toEqual('ConflictException');
        expect(e.portBranchName).toEqual(portBranchName);
        // still push the branch that was already created
        expect(run.getCall(3).args[0]).toEqual(
          `git push upstream ${portBranchName}`
        );
      }
    });
  });
});

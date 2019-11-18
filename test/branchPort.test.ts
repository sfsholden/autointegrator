import { createSandbox, SinonStub } from 'sinon';
import * as util from '../src/util';
import BranchPort from '../src/branchPort';
import { Context } from 'probot';
import { BASE, TMP_LOCATION } from '../src/constants';
import { join } from 'path';
import { getMessage } from '../src/messages';

/* eslint-disable @typescript-eslint/no-unused-vars */

describe('BranchPort', () => {
  const sandbox = createSandbox();

  afterEach(() => sandbox.restore());

  describe('setupRepo', () => {
    let port: BranchPort;
    let run: SinonStub<[string], string>;

    beforeEach(() => {
      port = new BranchPort({
        // @ts-ignore
        repo: () => ({ owner: 'testOwner', repo: 'testRepo' })
      });
    });

    it('Should run correct commands in order', async () => {
      run = sandbox.stub(util, 'run');
      const processSpy = sandbox.stub(process, 'chdir');
      const repoPath = join(TMP_LOCATION, `testOwner-testRepo`);
      const expectedUrl =
        'https://sfdx-backport:testtoken@github.com/testOwner/testRepo';

      await port.setupRepo('testtoken');

      const calls = run.getCalls();
      expect(calls[0].args[0]).toEqual(`git clone ${expectedUrl} ${repoPath}`);
      expect(calls[1].args[0]).toEqual(
        `git remote add upstream ${expectedUrl}`
      );
      expect(calls[2].args[0]).toEqual(`git fetch upstream ${BASE}`);
      expect(processSpy.firstCall.args[0]).toEqual(repoPath);
    });
  });

  describe('createPortBranch', () => {
    let port: BranchPort;
    let run: SinonStub<[string], string>;
    const expectedBranch = `${BASE}-port-123`;

    beforeEach(() => {
      run = sandbox.stub(util, 'run');
      port = new BranchPort({
        payload: {
          pull_request: { number: 123, merge_commit_sha: 'testsha' }
        }
      } as Context);
    });

    it('Should return expected name for port branch', () => {
      expect(port.createPortBranch()).toEqual(expectedBranch);
    });

    it('Should run correct commands in order', () => {
      port.createPortBranch();

      const calls = run.getCalls();
      expect(calls[0].args[0]).toEqual(`git checkout upstream/${BASE}`);
      expect(calls[1].args[0]).toEqual(`git checkout -b ${expectedBranch}`);
      expect(calls[2].args[0]).toEqual(`git cherry-pick testsha`);
      expect(calls[3].args[0]).toEqual(`git push upstream ${expectedBranch}`);
    });

    it('Should handle cherry-pick conflict error', () => {
      const error = new Error('after resolving the conflicts');
      run.withArgs('git cherry-pick testsha').throws(error);

      try {
        port.createPortBranch();
        fail('Should have thrown an error');
      } catch (e) {
        expect(e.name).toEqual('ConflictException');
        expect(e.portBranchName).toEqual(expectedBranch);
        // still push the branch that was already created
        expect(run.getCall(3).args[0]).toEqual(
          `git push upstream ${expectedBranch}`
        );
      }
    });
  });

  describe('createPortRequest', () => {
    const context = {
      // @ts-ignore
      repo: () => ({ owner: 'testOwner', repo: 'testRepo' }),
      payload: {
        pull_request: { number: 123 }
      },
      github: {
        pulls: {
          // @ts-ignore
          create: async options => ({
            data: { html_url: 'https://example.com' }
          })
        }
      }
    };
    // @ts-ignore
    const port = new BranchPort(context);

    it('Should create pull request with correct parameters', async () => {
      const create = sandbox.spy(context.github.pulls, 'create');

      await port.createPortRequest('testBranch');

      expect(create.firstCall.args[0]).toStrictEqual({
        owner: 'testOwner',
        repo: 'testRepo',
        title: getMessage('PortRequestTitle', ['123', BASE]),
        body: getMessage('PortRequestBody', ['123', BASE]),
        base: BASE,
        head: 'testBranch'
      });
    });

    it('Should return URL for new pull request', async () => {
      expect(await port.createPortRequest('testBranch')).toEqual(
        'https://example.com'
      );
    });
  });
});

import { Context } from 'probot';
import { join } from 'path';
import * as fs from 'fs';
import * as util from '../src/util';
import BranchPort from '../src/branchPort';
import { BASE, TMP_LOCATION } from '../src/constants';
import { getMessage } from '../src/messages';

/* eslint-disable @typescript-eslint/no-unused-vars */

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

// TODO: get rid of the @ts-ignore litter

describe('BranchPort', () => {
  let run: jest.SpyInstance;

  beforeAll(() => (run = jest.spyOn(util, 'run').mockImplementation(() => '')));
  afterAll(() => jest.restoreAllMocks());
  afterEach(() => jest.resetAllMocks());

  describe('setupRepo', () => {
    const port = new BranchPort({
      // @ts-ignore
      repo: () => ({ owner: 'testOwner', repo: 'testRepo' })
    });

    test('Should run correct commands in order', async () => {
      const chdir = jest
        .spyOn(process, 'chdir')
        .mockImplementationOnce(() => true);
      const repoPath = join(TMP_LOCATION, `testOwner-testRepo`);
      const expectedUrl =
        'https://sfdx-backport:testtoken@github.com/testOwner/testRepo';

      await port.setupRepo('testtoken');

      expect(run).nthCalledWith(1, `git clone ${expectedUrl} ${repoPath}`);
      expect(run).nthCalledWith(2, `git remote add upstream ${expectedUrl}`);
      expect(run).nthCalledWith(3, `git fetch upstream ${BASE}`);
      expect(chdir).toHaveBeenCalledWith(repoPath);
      chdir.mockRestore();
    });
  });

  describe('createPortBranch', () => {
    const port = new BranchPort({
      payload: {
        pull_request: { number: 123, merge_commit_sha: 'testsha' }
      }
    } as Context);
    const expectedBranch = `${BASE}-port-123`;

    test('should return expected name for port branch', () => {
      expect(port.createPortBranch()).toEqual(expectedBranch);
    });

    test('should run correct commands in order', () => {
      port.createPortBranch();
      expect(run).nthCalledWith(1, `git checkout upstream/${BASE}`);
      expect(run).nthCalledWith(2, `git checkout -b ${expectedBranch}`);
      expect(run).nthCalledWith(3, `git cherry-pick testsha`);
      expect(run).nthCalledWith(4, `git push upstream ${expectedBranch}`);
    });

    test('should handle cherry-pick conflict error', () => {
      run.mockImplementation(cmd => {
        if (cmd === 'git cherry-pick testsha') {
          throw new Error('after resolving the conflicts');
        }
        return '';
      });

      try {
        port.createPortBranch();
        fail('Should have thrown an error');
      } catch (e) {
        expect(e.name).toEqual('ConflictException');
        expect(e.portBranchName).toEqual(expectedBranch);
        // still push the branch that was already created
        expect(run).nthCalledWith(4, `git push upstream ${expectedBranch}`);
      }
    });
  });

  describe('createPortRequest', () => {
    let context: Context;
    let port: BranchPort;

    beforeEach(() => {
      context = {
        // @ts-ignore
        repo: () => ({ owner: 'testOwner', repo: 'testRepo' }),
        payload: {
          pull_request: { number: 123 }
        },
        github: {
          pulls: {
            // @ts-ignore
            create: jest.fn().mockResolvedValue({
              data: {
                html_url: 'https://example.com'
              }
            })
          }
        }
      };
      port = new BranchPort(context);
    });

    test('should create pull request with correct parameters', async () => {
      await port.createPortRequest('testBranch');
      expect(context.github.pulls.create).toHaveBeenCalledWith({
        owner: 'testOwner',
        repo: 'testRepo',
        title: getMessage('PortRequestTitle', ['123', BASE]),
        body: getMessage('PortRequestBody', ['123', BASE]),
        base: BASE,
        head: 'testBranch'
      });
    });

    test('should return URL for new pull request', async () => {
      expect(await port.createPortRequest('testBranch')).toEqual(
        'https://example.com'
      );
    });
  });

  describe('commentOnPr', () => {
    const context = {
      repo: () => ({ owner: 'testOwner', repo: 'testRepo' }),
      github: {
        issues: {
          createComment: jest.fn()
        }
      }
    };
    // @ts-ignore
    const port = new BranchPort(context);

    test('should comment on given issue number with correct parameters', () => {
      port.commentOnPr({ body: 'test comment', number: 42 });
      expect(context.github.issues.createComment).toBeCalledWith({
        owner: 'testOwner',
        repo: 'testRepo',
        issue_number: 42,
        body: 'test comment'
      });
    });
  });

  describe('cleanUp', () => {
    const repoPath = join(TMP_LOCATION, `testOwner-testRepo`);
    const port = new BranchPort({
      // @ts-ignore
      repo: () => ({ owner: 'testOwner', repo: 'testRepo' })
    });

    test('Should delete repo if folder exists', () => {
      mockedFs.existsSync.mockImplementation(path => path === repoPath);
      port.cleanUp();
      expect(fs.existsSync).toBeTruthy();
      expect(run).toHaveBeenCalledWith(`rm -rf ${repoPath}`);
    });

    test('Should do nothing if folder does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);
      port.cleanUp();
      expect(run).toHaveBeenCalledTimes(0);
    });
  });
});

import { join } from 'path';
import * as fs from 'fs';
import * as util from '../src/util';
import BranchPort, { TMP_LOCATION } from '../src/branchPort';
import { getMessage } from '../src/messages';
import { ContextBuilder } from './testUtil';

/* eslint-disable @typescript-eslint/no-unused-vars */

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('BranchPort', () => {
  let run: jest.SpyInstance;

  beforeEach(
    () => (run = jest.spyOn(util, 'run').mockImplementation(() => ''))
  );
  afterAll(() => jest.restoreAllMocks());
  afterEach(() => jest.clearAllMocks());

  describe('cloneRepo', () => {
    const chdir = jest.spyOn(process, 'chdir').mockImplementation(() => true);
    const port = new BranchPort(
      new ContextBuilder()
        .withRepo()
        .withPayload({ pull_request: { merge_commit_sha: 'testsha' } })
        .withGithub({
          repos: {
            getCommit: () => ({
              data: {
                commit: {
                  author: { name: 'My Name', email: 'myname@example.com' }
                }
              }
            })
          }
        })
        .build()
    );

    afterAll(() => chdir.mockRestore());

    test('should run correct commands in order', async () => {
      const repoPath = join(TMP_LOCATION, `testOwner-testRepo`);
      const expectedUrl =
        'https://sfdx-backport:testtoken@github.com/testOwner/testRepo';

      await port.cloneRepo('testtoken');

      expect(run).nthCalledWith(1, `git clone ${expectedUrl} ${repoPath}`);
      expect(run).nthCalledWith(2, `git remote add upstream ${expectedUrl}`);
      expect(run).nthCalledWith(3, `git config user.name "My Name"`);
      expect(run).nthCalledWith(
        4,
        `git config user.email "myname@example.com"`
      );
      expect(chdir).toHaveBeenCalledWith(repoPath);
    });
  });

  describe('createPortBranch', () => {
    const builder = new ContextBuilder().withPayload({
      pull_request: { number: 123, merge_commit_sha: 'testsha' }
    });
    const port = new BranchPort(builder.build());
    const target = 'develop';
    const expectedBranch = `${target}-port-123`;

    test('should return expected name for port branch', () => {
      expect(port.createPortBranch(target)).toEqual(expectedBranch);
    });

    test('should run correct commands in order', () => {
      port.createPortBranch(target);
      expect(run).nthCalledWith(1, `git fetch upstream ${target}`);
      expect(run).nthCalledWith(2, `git checkout upstream/${target}`);
      expect(run).nthCalledWith(3, `git checkout -b ${expectedBranch}`);
      expect(run).nthCalledWith(4, `git cherry-pick testsha`);
      expect(run).nthCalledWith(5, `git push upstream ${expectedBranch}`);
    });

    test('should handle missing target branch error', async () => {
      run.mockImplementation(cmd => {
        if (cmd === 'git fetch upstream badBranch') {
          throw new Error("fatal: Couldn't find remote ref");
        }
        return '';
      });

      try {
        await port.createPortBranch('badBranch');
        fail('should have thrown an error');
      } catch (e) {
        expect(e.name).toEqual('MissingTargetException');
      }
    });

    test('should handle cherry-pick conflict error', () => {
      run.mockImplementation(cmd => {
        if (cmd === 'git cherry-pick testsha') {
          throw new Error('after resolving the conflicts');
        }
        return '';
      });

      try {
        port.createPortBranch(target);
        fail('Should have thrown an error');
      } catch (e) {
        expect(e.name).toEqual('ConflictException');
        expect(e.portBranchName).toEqual(expectedBranch);
        // still push the branch that was already created
        expect(run).nthCalledWith(5, `git push upstream ${expectedBranch}`);
      }
    });
  });

  describe('createPortRequest', () => {
    const context = new ContextBuilder()
      .withRepo()
      .withPayload({ pull_request: { number: 123 } })
      .withGithub({
        pulls: {
          create: jest
            .fn()
            .mockResolvedValue({ data: { html_url: 'https://example.com' } })
        }
      })
      .build();
    const port = new BranchPort(context);
    const target = 'develop';

    test('should create pull request with correct parameters', async () => {
      await port.createPortRequest(target, 'testBranch');
      expect(context.github.pulls.create).toHaveBeenCalledWith({
        owner: 'testOwner',
        repo: 'testRepo',
        title: getMessage('PortRequestTitle', ['123', target]),
        body: getMessage('PortRequestBody', ['123', target]),
        base: target,
        head: 'testBranch'
      });
    });

    test('should return URL for new pull request', async () => {
      expect(await port.createPortRequest(target, 'testBranch')).toEqual(
        'https://example.com'
      );
    });
  });

  describe('commentOnPr', () => {
    const context = new ContextBuilder()
      .withRepo()
      .withGithub({
        issues: { createComment: jest.fn() }
      })
      .build();
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
    const port = new BranchPort(new ContextBuilder().withRepo().build());

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

  describe('getTargetBranches', () => {
    const builder = new ContextBuilder()
      .withRepo()
      .withPayload({ pull_request: { number: 123 } });

    test('should fetch target branches from PR labels', async () => {
      builder.withLabels(123, [
        'port:develop',
        'port:release',
        'not a port label'
      ]);
      const port = new BranchPort(builder.build());
      const targets = await port.getTargetBranches();
      expect(targets).toEqual(['develop', 'release']);
    });

    test('should return no target branches if there are no port labels', async () => {
      builder.withLabels(123, []);
      const port = new BranchPort(builder.build());
      expect(await port.getTargetBranches()).toEqual([]);
    });
  });
});

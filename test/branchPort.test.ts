import { join } from 'path';
import * as fs from 'fs';
import * as util from '../src/util';
import BranchPort from '../src/branchPort';
import { TMP_LOCATION } from '../src/constants';
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

  describe('setupRepo', () => {
    const chdir = jest.spyOn(process, 'chdir').mockImplementation(() => true);
    const port = new BranchPort(new ContextBuilder().withRepo().build());

    afterAll(() => chdir.mockRestore());

    test('should run correct commands in order', async () => {
      const repoPath = join(TMP_LOCATION, `testOwner-testRepo`);
      const expectedUrl =
        'https://sfdx-backport:testtoken@github.com/testOwner/testRepo';

      await port.setupRepo(['develop'], 'testtoken');

      expect(run).nthCalledWith(1, `git clone ${expectedUrl} ${repoPath}`);
      expect(run).nthCalledWith(2, `git remote add upstream ${expectedUrl}`);
      expect(run).nthCalledWith(3, `git fetch upstream develop`);
      expect(chdir).toHaveBeenCalledWith(repoPath);
    });

    test('should handle missing target branch error', async () => {
      run // why do i have to do this just to make the third call do something
        .mockImplementationOnce(() => '')
        .mockImplementationOnce(() => '')
        .mockImplementationOnce(cmd => {
          if (cmd === 'git fetch upstream badBranch') {
            throw new Error("fatal: Couldn't find remote ref");
          }
          return '';
        });

      try {
        await port.setupRepo(['badBranch'], 'testtoken');
        fail('should have thrown an error');
      } catch (e) {
        expect(e.name).toEqual('MissingTargetException');
      }
    });
  });

  describe('createPortBranch', () => {
    const builder = new ContextBuilder().withPayload({
      pull_request: { number: 123, merge_commit_sha: 'testsha' }
    });
    const port = new BranchPort(builder.build());
    const targets = ['develop'];
    const expectedBranch = `${targets[0]}-port-123`;

    test('should return expected name for port branch', () => {
      expect(port.createPortBranch(targets)).toEqual(expectedBranch);
    });

    test('should run correct commands in order', () => {
      port.createPortBranch(targets);
      expect(run).nthCalledWith(1, `git checkout upstream/${targets[0]}`);
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
        port.createPortBranch(targets);
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
    const targets = ['develop'];

    test('should create pull request with correct parameters', async () => {
      await port.createPortRequest(targets, 'testBranch');
      expect(context.github.pulls.create).toHaveBeenCalledWith({
        owner: 'testOwner',
        repo: 'testRepo',
        title: getMessage('PortRequestTitle', ['123', targets[0]]),
        body: getMessage('PortRequestBody', ['123', targets[0]]),
        base: targets[0],
        head: 'testBranch'
      });
    });

    test('should return URL for new pull request', async () => {
      expect(await port.createPortRequest(targets, 'testBranch')).toEqual(
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

import { Probot, createProbot } from 'probot';
import nock from 'nock';
import { app } from '../src';
import { Config } from '../src/util';
import * as openPayload from './fixtures/pull_request.opened.json';

nock.disableNetConnect();

describe('App', () => {
  let probot: Probot;

  beforeEach(() => {
    nock.disableNetConnect();
    probot = createProbot({ id: 1, cert: 'test', githubToken: 'test' });
    probot.load(app);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe('Autolabeling Opened Pull Requests', () => {
    const getConfig = jest.spyOn(Config.prototype, 'get');

    afterAll(() => getConfig.mockRestore());

    test('should apply port labels based on configuration', async done => {
      getConfig.mockResolvedValueOnce({
        triggers: { test: ['master', 'develop'] }
      });
      nock('https://api.github.com')
        .post('/repos/test-owner/test-repo/issues/1/labels', body => {
          done(expect(body).toEqual(['port:master', 'port:develop']));
          return true;
        })
        .reply(200);
      openPayload.pull_request.base.ref = 'test';
      openPayload.sender.type = 'User';

      await probot.receive({
        id: 'abc',
        name: 'pull_request',
        payload: openPayload
      });
    });

    test('should not label PR if it was opened by the bot', async done => {
      openPayload.sender.type = 'Bot';
      openPayload.pull_request.base.ref = 'test';
      getConfig.mockResolvedValueOnce({ triggers: { test: ['portBranch'] } });
      nock('https://api.github.com')
        .post('/repos/test-owner/test-repo/issues/1/labels', () => {
          done(fail('should not have hit this endpoint'));
          return false;
        })
        .reply(200);

      // @ts-ignore
      openPayload.testDone = done;

      await probot.receive({
        id: 'abc',
        name: 'pull_request',
        payload: openPayload
      });
    });

    test('should not label PR if there are no target branches for trigger', async done => {
      getConfig.mockResolvedValueOnce({ triggers: {} });
      nock('https://api.github.com')
        .post('/repos/test-owner/test-repo/issues/1/labels', () => {
          done(fail('should not have hit this endpoint'));
          return false;
        })
        .reply(200);
      // @ts-ignore
      openPayload.testDone = done;
      openPayload.pull_request.base.ref = 'test';
      openPayload.sender.type = 'User';

      await probot.receive({
        id: 'abc',
        name: 'pull_request',
        payload: openPayload
      });
    });
  });
});

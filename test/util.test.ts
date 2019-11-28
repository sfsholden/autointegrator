import * as util from '../src/util';
import { ContextBuilder } from './testUtil';
import * as child_process from 'child_process';
import { run } from '../src/util';

jest.mock('child_process');
const mockedCp = child_process as jest.Mocked<typeof child_process>;

describe('Utils', () => {
  afterEach(() => jest.resetAllMocks());

  describe('Config', () => {
    const { Config } = util;
    const context = { config: jest.fn() };

    test('should load expected config file', async () => {
      const triggerConfig = { triggers: { myBranch: ['abc', 'def'] } };
      context.config.mockResolvedValueOnce(triggerConfig);
      // @ts-ignore
      expect(await new Config(context).get()).toEqual(triggerConfig);
      expect(context.config).toHaveBeenCalledWith('autointegrator.yml');
    });

    test('should use default config if no file found', async () => {
      context.config.mockResolvedValueOnce(null);
      // @ts-ignore
      expect(await new Config(context).get()).toEqual({ triggers: {} });
    });
  });

  describe('Logger', () => {
    const { Logger } = util;
    const rootLogTarget = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    const builder = new ContextBuilder().withPayload({
      installation: { id: 123 }
    });
    // @ts-ignore
    const logger = new Logger({ log: rootLogTarget }, builder.build());

    test('should log with info log target', () => {
      logger.info('test message');
      expect(rootLogTarget.info).toHaveBeenCalledWith('[123] test message');
    });

    test('should log with warn log target', () => {
      logger.warn('test message');
      expect(rootLogTarget.warn).toHaveBeenCalledWith('[123] test message');
    });

    test('should log with error log target', () => {
      logger.error('test message');
      expect(rootLogTarget.error).toHaveBeenCalledWith('[123] test message');
    });

    test('should redact defined secrets from log messages', () => {
      logger.addSecret('testtoken', 'mybranch');
      logger.info('My testtoken and mybranch');
      logger.warn('My testtoken and mybranch');
      logger.error('My testtoken and mybranch');

      expect(rootLogTarget.info).toHaveBeenCalledWith('[123] My * and *');
      expect(rootLogTarget.warn).toHaveBeenCalledWith('[123] My * and *');
      expect(rootLogTarget.error).toHaveBeenCalledWith('[123] My * and *');
    });
  });

  describe('Command Executor (run)', () => {
    test('should run execSync and return stdio', () => {
      mockedCp.execSync.mockReturnValueOnce(Buffer.from('some output'));
      expect(run('some command')).toEqual('some output');
      expect(child_process.execSync).toHaveBeenCalledWith('some command', {
        stdio: 'pipe'
      });
    });

    test('should throw error if exec fails with stderr', () => {
      mockedCp.execSync.mockImplementationOnce(() => {
        const error = new Error();
        // @ts-ignore
        error.stderr = 'some error';
        throw error;
      });
      try {
        run('some command');
        fail('should have thrown an error');
      } catch (e) {
        expect(e.message).toEqual('some error');
      }
    });
  });
});

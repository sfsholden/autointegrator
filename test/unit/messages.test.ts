import { getMessage } from '../../src/messages';

describe('Messages', () => {
  test('should fetch message with a given key', () => {
    expect(getMessage('LogCherryPickFailed')).toEqual(
      'Cherry pick failed due to merge conflicts'
    );
  });

  test('should format message with string arguments', () => {
    expect(getMessage('PortRequestTitle', ['321', 'testFeature'])).toEqual(
      'Port #321 to the testFeature branch'
    );
  });

  test('should throw error for missing message key', () => {
    try {
      getMessage('DoesNotExist');
      fail('should have thrown an error');
    } catch (e) {
      expect(e.message).toEqual('Missing message for key DoesNotExist');
    }
  });
});

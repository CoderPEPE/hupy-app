import { isValidEmail, MIN_PASSWORD_LENGTH } from './validation';

describe('isValidEmail', () => {
  it('accepts well-formed emails', () => {
    expect(isValidEmail('sergio@example.com')).toBe(true);
    expect(isValidEmail('a.b+c@sub.domain.co')).toBe(true);
    expect(isValidEmail('  user@example.com  ')).toBe(true); // trims
  });

  it('rejects malformed emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('plainaddress')).toBe(false);
    expect(isValidEmail('missing@tld')).toBe(false);
    expect(isValidEmail('@nodomain.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user name@example.com')).toBe(false);
    expect(isValidEmail('user@exa mple.com')).toBe(false);
  });
});

describe('MIN_PASSWORD_LENGTH', () => {
  it('is a sane minimum of 8 characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect('password'.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect('short'.length).toBeLessThan(MIN_PASSWORD_LENGTH);
  });
});

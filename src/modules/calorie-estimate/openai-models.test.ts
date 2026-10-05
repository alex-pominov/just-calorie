import { chooseEstimateModel } from './openai-models';
import { ESTIMATE_MODEL } from './openai-request';

const catalog = (...models: Record<string, unknown>[]) => ({ models });

describe('chooseEstimateModel', () => {
  it("picks the app's own model when the account's catalog lists it", () => {
    const body = catalog({ slug: 'gpt-6.1-sol', visibility: 'list' }, { slug: ESTIMATE_MODEL, visibility: 'list' });

    expect(chooseEstimateModel(body)).toBe(ESTIMATE_MODEL);
  });

  it('otherwise picks the first listed model, keeping the server’s order', () => {
    const body = catalog({ slug: 'hidden-model', visibility: 'hide' }, { slug: 'gpt-6.1-sol', visibility: 'list' }, { slug: 'gpt-6.1-terra', visibility: 'list' });

    expect(chooseEstimateModel(body)).toBe('gpt-6.1-sol');
  });

  it('never picks a model the catalog hides, even the app’s own', () => {
    const body = catalog({ slug: ESTIMATE_MODEL, visibility: 'hide' }, { slug: 'gpt-6.1-sol', visibility: 'list' });

    expect(chooseEstimateModel(body)).toBe('gpt-6.1-sol');
  });

  it.each([
    ['no listed model', catalog({ slug: 'a', visibility: 'hide' })],
    ['no models array', { data: [] }],
    ['a body that is not an object', 'models'],
  ])("refuses a catalog with %s as 'invalid-response'", (_case, body) => {
    expect(() => chooseEstimateModel(body)).toThrow(expect.objectContaining({ kind: 'invalid-response' }));
  });
});

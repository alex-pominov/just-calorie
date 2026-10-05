import { parseEstimateResponse } from './openai-response';

const withText = (text: string, status = 'completed') => ({
  status,
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
});
const withEstimate = (estimate: unknown) => withText(JSON.stringify(estimate));

describe('parseEstimateResponse', () => {
  it('reads the reply and kcal from the message output, past a reasoning item', () => {
    const body = {
      status: 'completed',
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text: '{"reply":" Pasta, 600 kcal. ","kcal":600}' }] },
      ],
    };

    expect(parseEstimateResponse(body)).toEqual({ reply: 'Pasta, 600 kcal.', kcal: 600 });
  });

  it('keeps a null kcal as null: the sentence stands alone', () => {
    expect(parseEstimateResponse(withEstimate({ reply: 'I cannot see any food.', kcal: null }))).toEqual({
      reply: 'I cannot see any food.',
      kcal: null,
    });
  });

  it('turns a refusal into its sentence with no kcal', () => {
    const body = { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'I cannot help with that.' }] }] };

    expect(parseEstimateResponse(body)).toEqual({ reply: 'I cannot help with that.', kcal: null });
  });

  it.each([
    ['an incomplete response', withText('{"reply":"Apple","kcal":95}', 'incomplete')],
    ['a body that is not an object', 'oops'],
    ['no message in the output', { status: 'completed', output: [{ type: 'reasoning' }] }],
    ['a message with no text', { status: 'completed', output: [{ type: 'message', content: [] }] }],
    ['text that is not JSON', withText('About 95 kcal')],
    ['a reply without kcal', withEstimate({ reply: 'Apple' })],
    ['a kcal without reply', withEstimate({ kcal: 95 })],
    ['a blank reply', withEstimate({ reply: '  ', kcal: 95 })],
    ['a zero kcal', withEstimate({ reply: 'Water', kcal: 0 })],
    ['a negative kcal', withEstimate({ reply: 'Apple', kcal: -95 })],
    ['a fractional kcal', withEstimate({ reply: 'Apple', kcal: 95.5 })],
    ['a kcal written as a string', withEstimate({ reply: 'Apple', kcal: '95' })],
  ])("refuses %s as 'invalid-response'", (_case, body) => {
    expect(() => parseEstimateResponse(body)).toThrow(expect.objectContaining({ kind: 'invalid-response' }));
  });
});

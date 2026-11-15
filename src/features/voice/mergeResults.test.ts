import { mergeResults } from './useSpeechRecognition';

describe('mergeResults', () => {
  it('appends separate pieces (desktop Chrome)', () => {
    expect(mergeResults(['Mydin 55 ringgit', ' Petronas 60'])).toBe('Mydin 55 ringgit Petronas 60');
  });

  it('does not double words when each result repeats the sentence so far (Android Chrome)', () => {
    expect(mergeResults(['Mydin', 'Mydin 55', 'Mydin 55 ringgit'])).toBe('Mydin 55 ringgit');
    expect(mergeResults(['mydin', 'Mydin 55 ringgit', 'Mydin 55 ringgit Petronas 60'])).toBe('Mydin 55 ringgit Petronas 60');
  });

  it('drops a repeated final result', () => {
    expect(mergeResults(['Mydin 55 ringgit', 'Mydin 55 ringgit'])).toBe('Mydin 55 ringgit');
    expect(mergeResults(['Jualan hari ini 1500', '1500'])).toBe('Jualan hari ini 1500');
  });

  it('keeps words the speaker genuinely repeated within one result', () => {
    expect(mergeResults(['lima lima ringgit'])).toBe('lima lima ringgit');
  });

  it('ignores empty results and extra spaces', () => {
    expect(mergeResults(['', '  Mydin   55 ', ''])).toBe('Mydin 55');
  });
});

import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

/** Stops a recognizer without letting its late events (browsers fire onend after abort) reach the UI. */
function detach(rec: Recognition | null) {
  if (!rec) return;
  rec.onresult = null;
  rec.onerror = null;
  rec.onend = null;
  rec.abort();
}

function getRecognition(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** 'not-allowed' | 'no-speech' | 'network' | 'audio-capture' | 'unsupported' | other browser codes */
export type SpeechError = string;

/** Browser speech-to-text in Malay. `onDone` gets the final transcript when listening ends. */
export function useSpeechRecognition(onDone: (transcript: string) => void) {
  const supported = Boolean(getRecognition());
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<SpeechError | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const textRef = useRef('');
  const failedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => () => detach(recRef.current), []);

  const start = useCallback(() => {
    const Ctor = getRecognition();
    if (!Ctor) {
      setError('unsupported');
      return;
    }
    detach(recRef.current);
    const rec = new Ctor();
    rec.lang = 'ms-MY';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    textRef.current = '';
    failedRef.current = false;
    setTranscript('');
    setError(null);

    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i]![0].transcript;
      textRef.current = text;
      setTranscript(text);
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      failedRef.current = true;
      setError(e.error);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const text = textRef.current.trim();
      if (text) onDoneRef.current(text);
      else if (!failedRef.current) setError('no-speech');
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setError('not-allowed');
    }
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported, listening, transcript, error, start, stop };
}

export function speechErrorMessage(error: SpeechError): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Akses mikrofon ditolak. Benarkan mikrofon untuk laman ini dalam tetapan pelayar, atau taip di bawah.';
    case 'no-speech':
      return 'Tiada suara dikesan. Tekan mikrofon dan cuba lagi.';
    case 'audio-capture':
      return 'Mikrofon tidak dijumpai pada peranti ini.';
    case 'network':
      return 'Pengecaman suara perlukan internet. Semak sambungan anda, atau taip di bawah.';
    case 'unsupported':
      return 'Pelayar ini tidak menyokong pengecaman suara. Cuba Chrome atau Safari, atau taip di bawah.';
    default:
      return 'Pengecaman suara terhenti. Cuba lagi, atau taip di bawah.';
  }
}

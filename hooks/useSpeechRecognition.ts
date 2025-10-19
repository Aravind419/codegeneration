import { useState, useEffect, useRef } from 'react';

// TypeScript definitions for the Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export const useSpeechRecognition = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // This ref tracks if the user explicitly stopped listening,
  // vs. the service stopping on its own (e.g., due to 'no-speech' timeout).
  const userStoppedRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
      // If the service stopped on its own and wasn't manually stopped by the user, restart it.
      // This creates the "always-on" listening experience.
      if (!userStoppedRef.current) {
        // Use a small timeout to prevent rapid-fire restart loops on certain errors.
        setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch(e) {
            console.error("Error attempting to restart speech recognition:", e);
            // If restart fails, ensure we stop trying.
            userStoppedRef.current = true;
          }
        }, 100);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Recoverable errors will be logged as warnings, and we'll let `onend` attempt a restart.
      if (event.error === 'no-speech' || event.error === 'audio-capture' || event.error === 'network') {
        console.warn(`Speech recognition warning: ${event.error}. Will attempt to restart.`);
      } else {
        // Fatal errors will be logged as errors and we will not attempt to restart.
        console.error(`Speech recognition fatal error: ${event.error}.`);
        userStoppedRef.current = true;
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const fullTranscript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      setTranscript(fullTranscript);
    };
    
    recognitionRef.current = recognition;

    return () => {
      userStoppedRef.current = true;
      if (recognitionRef.current) {
        // Clean up listeners to prevent memory leaks
        recognitionRef.current.onstart = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      userStoppedRef.current = false;
      setTranscript('');
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      userStoppedRef.current = true;
      recognitionRef.current.stop();
    }
  };

  return { isListening, transcript, startListening, stopListening };
};

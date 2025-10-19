import React from 'react';
import { MicIcon, SendIcon, SpinnerIcon } from './Icons';

interface InputBarProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
}

export const InputBar: React.FC<InputBarProps> = ({
  prompt,
  setPrompt,
  onSubmit,
  isLoading,
  isListening,
  startListening,
  stopListening
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSubmit();
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center w-full bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-3 sm:p-4 gap-3 sm:gap-0">
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isListening ? "Listening..." : "Describe what you want to build..."}
        className="flex-grow bg-transparent text-gray-200 placeholder-gray-500 focus:outline-none px-4 py-4 sm:py-3 text-base sm:text-base rounded-lg border border-gray-600 sm:border-0 focus:border-indigo-500 transition-colors min-h-[48px]"
        disabled={isListening}
        aria-label="Describe your coding request"
      />
      <div className="flex items-center gap-3 sm:gap-2 sm:ml-3">
        <button
          onClick={isListening ? stopListening : startListening}
          className={`p-4 sm:p-3 rounded-full transition-all duration-200 flex-shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center ${
            isListening 
              ? 'bg-red-500 text-white animate-pulse shadow-lg' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600 active:bg-gray-500'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label={isListening ? "Stop listening" : "Start listening"}
        >
          <MicIcon className="w-6 h-6 sm:w-5 sm:h-5" />
        </button>
        <button
          onClick={onSubmit}
          disabled={!prompt.trim() || isLoading}
          className="flex items-center justify-center bg-indigo-600 text-white px-6 sm:px-4 py-4 sm:py-3 rounded-lg font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-all duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed flex-grow sm:flex-grow-0 min-h-[48px] sm:min-h-0 shadow-md"
          aria-label="Generate code"
        >
          {isLoading ? (
            <SpinnerIcon className="w-5 h-5 animate-spin" />
          ) : (
            <SendIcon className="w-5 h-5" />
          )}
          <span className="ml-2 text-base sm:text-base font-medium">{isLoading ? 'Generating...' : 'Generate'}</span>
        </button>
      </div>
    </div>
  );
};
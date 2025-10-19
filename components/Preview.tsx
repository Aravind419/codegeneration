import React, { useState, useRef, useEffect } from 'react';
import { FullscreenEnterIcon, FullscreenExitIcon } from './Icons';

interface PreviewProps {
  html: string;
  isFullscreen: boolean;
  setIsFullscreen: (isFullscreen: boolean) => void;
}

export const Preview: React.FC<PreviewProps> = ({ html, isFullscreen, setIsFullscreen }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleFullscreenToggle = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');
  };

  // Handle iframe load events
  const handleIframeLoad = () => {
    setIsLoading(false);
    setHasError(false);
    
    // Check for errors in the iframe
    try {
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow) {
        // Listen for console errors from iframe
        const originalConsoleError = iframe.contentWindow.console.error;
        iframe.contentWindow.console.error = function(...args) {
          const message = args.join(' ');
          // Check for Babel syntax errors
          if (message.includes('SyntaxError') || 
              message.includes('Unexpected token') ||
              message.includes('Babel') ||
              message.includes('Inline Babel script')) {
            setHasError(true);
            setErrorMessage('React code syntax error. Please check your JSX/JavaScript syntax.');
          } else {
            setHasError(true);
            setErrorMessage(message);
          }
          originalConsoleError.apply(iframe.contentWindow.console, args);
        };
      }
    } catch (error) {
      // Cross-origin restrictions might prevent access
      console.warn('Cannot access iframe console:', error);
    }
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setHasError(true);
    setErrorMessage('Failed to load preview content');
  };

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when in fullscreen
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isFullscreen, setIsFullscreen]);

  // Enhanced sandbox attributes for security
  const sandboxAttributes = [
    'allow-scripts',           // Allow JavaScript execution
    'allow-modals',           // Allow modal dialogs
    'allow-forms',           // Allow form submissions
    'allow-same-origin',      // Allow same-origin requests
    'allow-popups',           // Allow popup windows
    'allow-presentation',     // Allow presentation mode
    'allow-top-navigation-by-user-activation', // Allow top navigation on user activation
  ].join(' ');

  const iframeContent = (
    <div className="relative w-full h-full">
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
          <div className="flex flex-col items-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="text-sm text-gray-600">Loading preview...</p>
          </div>
        </div>
      )}
      
      {/* Error indicator */}
      {hasError && (
        <div className="absolute top-2 right-2 bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded z-20 max-w-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Preview Error</span>
            <button
              onClick={handleRefresh}
              className="ml-2 text-red-500 hover:text-red-700"
              title="Refresh preview"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <p className="text-xs mt-1">{errorMessage}</p>
        </div>
      )}
      
      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        className="absolute top-2 left-2 bg-gray-800 text-white p-2 rounded-md hover:bg-gray-700 transition-colors z-20"
        title="Refresh preview"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
      </button>
      
      <iframe
        key={refreshKey}
        ref={iframeRef}
        srcDoc={html}
        title="Live Preview"
        sandbox={sandboxAttributes}
        className="w-full h-full border-0"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        style={{ 
          background: 'white',
          minHeight: '400px'
        }}
      />
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
        {/* Fullscreen Header - Mobile Enhanced */}
        <div className="flex justify-between items-center p-3 sm:p-4 bg-gray-800 border-b border-gray-700">
          <h2 className="font-semibold text-white text-base sm:text-lg">Live Preview - Fullscreen</h2>
          <div className="flex items-center space-x-2">
            <span className="text-xs sm:text-sm text-gray-400 hidden sm:inline">Press ESC to exit</span>
            <button
              onClick={handleFullscreenToggle}
              className="text-gray-300 hover:text-white p-2 sm:p-3 rounded-md hover:bg-gray-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Exit fullscreen"
            >
              <FullscreenExitIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>
        
        {/* Fullscreen Content */}
        <div className="flex-1 bg-white">
          {iframeContent}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-inner flex flex-col h-full overflow-hidden border border-gray-700">
       <div className="flex justify-between items-center p-3 sm:p-4 bg-gray-700/50 border-b border-gray-700">
        <h2 className="font-semibold text-gray-300 text-base sm:text-lg">Live Preview</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            className="text-gray-300 hover:text-white p-2 rounded-md hover:bg-gray-600 transition-colors"
            title="Refresh preview"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={handleFullscreenToggle}
            className="text-gray-300 hover:text-white p-2 sm:p-3 rounded-md hover:bg-gray-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Enter fullscreen"
          >
            <FullscreenEnterIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>
      <div className="flex-1 relative">
        {iframeContent}
      </div>
    </div>
  );
};
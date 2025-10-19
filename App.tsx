import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { InputBar } from './components/InputBar';
import { CodeWorkspace, FileData } from './components/CodeWorkspace';
import { Preview } from './components/Preview';
import { ConfirmationModal } from './components/Modals';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { formatCode } from './utils/formatter';

const SYSTEM_INSTRUCTION_STREAM = `You are an expert web developer AI. Your task is to generate the complete code for a web component or a full webpage based on the user's description.

You MUST respond with a stream of text. Use the following special format to structure your response:

1.  Start each file with a file marker: \`>>>FILE: [filename.ext]\` on its own line.
2.  Follow the marker with the complete code for that file.
3.  Do NOT add any other markers, comments, or explanations.
4.  Stream the response, outputting the file marker and then the file content chunk by chunk.

Example of the streamed text output:
>>>FILE: index.html
<!DOCTYPE html>
<html lang="en">
<head>
    <title>My Page</title>
</head>
<body>
    <h1>Hello!</h1>
</body>
</html>
>>>FILE: style.css
body {
    font-family: sans-serif;
}
>>>FILE: script.js
console.log("Hello from script!");

For React components, use this format:
>>>FILE: App.jsx
function App() {
  return (
    <div>
      <h1>Hello React!</h1>
    </div>
  );
}

For nested folders, use this format:
>>>FILE: components/Button.jsx
function Button({ children, onClick }) {
  return (
    <button onClick={onClick} className="btn">
      {children}
    </button>
  );
}

IMPORTANT RULES FOR REACT:
- NEVER include external script src or link href references (no <script src="..."> or <link href="...">)
- NEVER include import statements that reference external files
- NEVER include export statements
- NEVER mix HTML tags with JavaScript/JSX code
- Create self-contained code that works without external dependencies
- For React projects, create separate component files with proper function declarations
- Use modern React patterns (functional components, hooks)
- Include proper CSS styling for components
- Ensure all code is complete and runnable in a sandbox environment
- Use inline styles or embedded CSS only
- Create all necessary files (HTML, CSS, JS, JSX, TSX)
- Support nested folder structure using forward slashes in filenames
- Keep JavaScript/JSX code separate from HTML content
- Use proper JSX syntax without HTML mixing
`;

const DEFAULT_FILES: FileData[] = [];

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<FileData[]>(() => {
    try {
      const saved = localStorage.getItem('code-project');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate that it's an array of files with proper structure
        if (Array.isArray(parsed) && parsed.every(file => 
          typeof file === 'object' && 
          typeof file.fileName === 'string' && 
          typeof file.content === 'string'
        )) {
          return parsed;
        } else {
          console.warn('Invalid project data structure, clearing localStorage');
          localStorage.removeItem('code-project');
          return DEFAULT_FILES;
        }
      }
      return DEFAULT_FILES;
    } catch (error) {
      console.error("Failed to parse project from local storage:", error);
      // Clear all potentially corrupted data
      try {
        localStorage.removeItem('code-project');
        // Clear any other project-related keys
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('code') || key.includes('project') || key.includes('ai'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      } catch (clearError) {
        console.error('Error clearing localStorage:', clearError);
      }
      return DEFAULT_FILES;
    }
  });
  const [activeFileName, setActiveFileName] = useState(files[0]?.fileName || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [snippets, setSnippets] = useState<string[]>([]);
  const [isSnippetsLoading, setIsSnippetsLoading] = useState(false);
  const [snippetsError, setSnippetsError] = useState<string | null>(null);
  
  // State for resizable panes and mobile layout
  const [editorWidth, setEditorWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Confirmation modal state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string>('');
  const [isConfirming, setIsConfirming] = useState(false);

  const { isListening, transcript, startListening, stopListening } = useSpeechRecognition();
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

  const submissionSourceRef = useRef<'voice' | 'manual'>('manual');
  const debounceTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem('code-project', JSON.stringify(files));
    if (!files.some(f => f.fileName === activeFileName)) {
      setActiveFileName(files[0]?.fileName || '');
    }
  }, [files, activeFileName]);

  // Effect for handling auto-submission after speech
  useEffect(() => {
    if (isListening && transcript) {
      setPrompt(transcript);

      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      
      debounceTimeoutRef.current = window.setTimeout(() => {
        if (transcript.trim() && !isLoading && !isConfirming) {
          submissionSourceRef.current = 'voice';
          handleSubmitRequest(transcript);
        }
      }, 1500); // 1.5s delay
    }
    
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [transcript, isListening, isLoading]);

  // Add global error handler to reduce console spam and fix Monaco Editor cancellation errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Suppress common extension-related errors and Monaco Editor cancellation errors
      if (event.message && (
        event.message.includes('Extension context invalidated') ||
        event.message.includes('Non-Error promise rejection') ||
        event.message.includes('ResizeObserver loop limit exceeded') ||
        event.message.includes('Canceled') ||
        event.message.includes('ERR Canceled') ||
        event.message.includes('Monaco Editor') ||
        event.message.includes('_amdLoaderGlobal') ||
        event.message.includes('already been declared') ||
        event.message.includes('editor.api') ||
        event.message.includes('operation was canceled') ||
        event.message.includes('Cancelled')
      )) {
        event.preventDefault();
        return false;
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Suppress common extension-related promise rejections and Monaco Editor cancellations
      if (event.reason && (
        event.reason.message?.includes('Extension context invalidated') ||
        event.reason.message?.includes('chrome-extension://') ||
        event.reason.message?.includes('Canceled') ||
        event.reason.message?.includes('ERR Canceled') ||
        event.reason.message?.includes('Monaco Editor') ||
        event.reason.message?.includes('_amdLoaderGlobal') ||
        event.reason.message?.includes('already been declared') ||
        event.reason.message?.includes('editor.api') ||
        event.reason.message?.includes('operation was canceled') ||
        event.reason.message?.includes('Cancelled')
      )) {
        event.preventDefault();
        return false;
      }
    };

    // Override console.error to filter out Monaco Editor cancellation errors
    const originalConsoleError = console.error;
    console.error = function(...args) {
      const message = args.join(' ');
      if (message.includes('Canceled') || 
          message.includes('ERR Canceled') || 
          message.includes('operation was canceled') ||
          message.includes('Cancelled') ||
          message.includes('editor.api')) {
        // Suppress Monaco Editor cancellation errors
        return;
      }
      originalConsoleError.apply(console, args);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      // Restore original console.error
      console.error = originalConsoleError;
    };
  }, []);

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // F11 or Ctrl+F for fullscreen toggle
      if (event.key === 'F11' || (event.ctrlKey && event.key === 'f')) {
        event.preventDefault();
        setIsFullscreen(!isFullscreen);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);
  
  const resetProject = () => {
    // Clear all state
    setFiles(DEFAULT_FILES);
    setActiveFileName('');
    setPrompt('');
    setError(null);
    setSnippets([]);
    setSnippetsError(null);
    
    // Clear localStorage completely to prevent any merging
    try {
      localStorage.removeItem('code-project');
      // Also clear any other potential project-related keys
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('code') || key.includes('project') || key.includes('ai'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      console.log('Project reset: All localStorage data cleared');
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  };

  const handleFetchSnippets = async (fileContent: string, fileName: string) => {
    setIsSnippetsLoading(true);
    setSnippetsError(null);
    setSnippets([]);
    try {
      const snippetPrompt = `Based on the following code from the file "${fileName}", generate a list of 5 relevant and useful code snippets. The snippets should be practical additions or improvements.

File Content:
\`\`\`
${fileContent}
\`\`\`

Respond with a JSON object containing a "snippets" key, which is an array of code strings.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: snippetPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              snippets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['snippets'],
          },
        },
      });

      const parsed = JSON.parse(response.text.trim());
      if (parsed.snippets && Array.isArray(parsed.snippets)) {
        setSnippets(parsed.snippets);
      } else {
        throw new Error('Invalid snippet format from API.');
      }
    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setSnippetsError(`Failed to fetch snippets: ${errorMessage}`);
    } finally {
      setIsSnippetsLoading(false);
    }
  };

  // Check if there's existing code that would be replaced
  const hasExistingCode = files.some(file => file.content.trim().length > 0);

  const handleSubmitRequest = (finalPrompt?: string) => {
    const promptToUse = finalPrompt || prompt;
    if (!promptToUse.trim() || isLoading) return;

    // If there's existing code, show confirmation modal
    if (hasExistingCode) {
      setPendingPrompt(promptToUse);
      setShowConfirmation(true);
    } else {
      // No existing code, proceed directly
      handleSubmit(promptToUse);
    }
  };

  const handleConfirmSubmit = async () => {
    setIsConfirming(true);
    setShowConfirmation(false);
    await handleSubmit(pendingPrompt);
    setIsConfirming(false);
    setPendingPrompt('');
  };

  const handleCancelSubmit = () => {
    setShowConfirmation(false);
    setPendingPrompt('');
  };

  const handleSubmit = async (finalPrompt?: string) => {
    const promptToUse = finalPrompt || prompt;
    if (!promptToUse.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    // Don't clear files immediately to avoid the find error
    const initialFiles: FileData[] = [];
    let currentFileName: string | null = null;
    let buffer = '';

    try {
      const stream = await ai.models.generateContentStream({
        model: 'gemini-2.5-pro',
        contents: promptToUse,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_STREAM,
        },
      });

      for await (const chunk of stream) {
        buffer += chunk.text;
        
        let lineEndIndex;
        // Process all complete lines in the buffer
        while ((lineEndIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.substring(0, lineEndIndex);
            buffer = buffer.substring(lineEndIndex + 1); // Keep the remainder for the next iteration

            if (line.startsWith('>>>FILE:')) {
                const newFileName = line.substring('>>>FILE:'.length).trim();
                if (newFileName) {
                    currentFileName = newFileName;
                    setFiles(prevFiles => {
                        // Avoid adding duplicate files if the stream re-sends a header
                        if (prevFiles.some(f => f.fileName === newFileName)) {
                            return prevFiles;
                        }
                        
                        // Create file with nested folder support
                        const fileData: FileData = { 
                          fileName: newFileName, 
                          content: '',
                          type: 'file',
                          path: newFileName.includes('/') ? newFileName.substring(0, newFileName.lastIndexOf('/')) : ''
                        };
                        
                        return [...prevFiles, fileData];
                    });
                    setActiveFileName(newFileName);
                }
            } else if (currentFileName) {
                // Add the line of code to the current file
                setFiles(prevFiles =>
                    prevFiles.map(f =>
                        f.fileName === currentFileName
                            ? { ...f, content: f.content + line + '\n' }
                            : f
                    )
                );
            }
        }
      }

      // After the stream is done, process any remaining text in the buffer
      if (currentFileName && buffer.length > 0) {
           setFiles(prevFiles =>
              prevFiles.map(f =>
                  f.fileName === currentFileName
                      ? { ...f, content: f.content + buffer }
                      : f
              )
          );
      }

    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Failed to generate code: ${errorMessage}. Please check your API key and try again.`);
    } finally {
      setIsLoading(false);
      // Final formatting pass after the stream is complete
      setFiles(currentFiles => {
        // Format files asynchronously but don't block the UI
        Promise.all(
          currentFiles.map(async (file) => ({
            fileName: file.fileName,
            content: await formatCode(file.fileName, file.content),
          }))
        ).then(formattedFiles => {
          setFiles(formattedFiles);
        }).catch(error => {
          console.warn('Failed to format some files:', error);
        });
        return currentFiles; // Return current files immediately
      });

      if (submissionSourceRef.current === 'voice') {
        startListening();
      }
    }
  };

  const htmlContent = useMemo(() => {
    // Helper function to flatten nested file structure
    const flattenFiles = (fileList: FileData[]): FileData[] => {
      const result: FileData[] = [];
      fileList.forEach(file => {
        if (file.type === 'folder' && file.children) {
          result.push(...flattenFiles(file.children));
        } else {
          result.push(file);
        }
      });
      return result;
    };

    const flatFiles = flattenFiles(files);
    
    // Check for React components first
    const reactFiles = flatFiles.filter(f => 
      f.fileName.endsWith('.jsx') || 
      f.fileName.endsWith('.tsx') || 
      (f.fileName.endsWith('.js') && f.content.includes('React'))
    );

    if (reactFiles.length > 0) {
      // Generate React app HTML with enhanced sandbox features
      const mainComponent = reactFiles.find(f => 
        f.fileName.includes('App') || 
        f.fileName.includes('index') || 
        f.fileName.includes('main')
      ) || reactFiles[0];

      const cssFiles = flatFiles.filter(f => f.fileName.endsWith('.css'));
      const cssContent = cssFiles.map(f => f.content).join('\n');

      // Clean and prepare React code - separate JS/JSX from HTML
      const jsFiles = flatFiles.filter(f => 
        f.fileName.endsWith('.js') || 
        f.fileName.endsWith('.jsx') || 
        f.fileName.endsWith('.ts') || 
        f.fileName.endsWith('.tsx')
      );
      
      const htmlFiles = flatFiles.filter(f => f.fileName.endsWith('.html'));

      // Clean React/JS code
      const cleanReactCode = jsFiles.map(f => {
        let content = f.content;
        // Remove import statements that reference external files
        content = content.replace(/import\s+.*?from\s+['"][^'"]*['"];?\s*/g, '');
        // Remove export statements that might cause issues
        content = content.replace(/export\s+default\s+/g, '');
        content = content.replace(/export\s+{.*?};\s*/g, '');
        // Remove any HTML tags that might have been mixed in
        content = content.replace(/<[^>]*>/g, '');
        return content;
      }).join('\n\n');

      // Extract HTML content if any
      const htmlContent = htmlFiles.map(f => f.content).join('\n');

      return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React App - Sandbox</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
        ${cssContent}
        
        /* Sandbox styling */
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: #f5f5f5;
        }
        
        #root {
            max-width: 100%;
            margin: 0 auto;
        }
        
        /* Error boundary styling */
        .error-boundary {
            padding: 20px;
            background: #fee;
            border: 1px solid #fcc;
            border-radius: 8px;
            color: #c33;
            margin: 20px 0;
        }
        
        .error-title {
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .error-message {
            font-family: monospace;
            background: #fdd;
            padding: 10px;
            border-radius: 4px;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <div id="root"></div>
    
    <!-- Separate script for React components -->
    <script type="text/babel">
        // Error boundary component
        class ErrorBoundary extends React.Component {
            constructor(props) {
                super(props);
                this.state = { hasError: false, error: null };
            }
            
            static getDerivedStateFromError(error) {
                return { hasError: true, error };
            }
            
            componentDidCatch(error, errorInfo) {
                console.error('React Error:', error, errorInfo);
            }
            
            render() {
                if (this.state.hasError) {
                    return React.createElement('div', { className: 'error-boundary' },
                        React.createElement('div', { className: 'error-title' }, 'Component Error'),
                        React.createElement('div', { className: 'error-message' }, 
                            this.state.error ? this.state.error.toString() : 'Unknown error occurred'
                        )
                    );
                }
                
                return this.props.children;
            }
        }
        
        // Enhanced console logging
        const originalConsoleError = console.error;
        console.error = function(...args) {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'position: fixed; top: 10px; right: 10px; background: #fee; color: #c33; padding: 10px; border-radius: 4px; z-index: 1000; max-width: 300px; font-size: 12px;';
            errorDiv.textContent = args.join(' ');
            document.body.appendChild(errorDiv);
            setTimeout(() => errorDiv.remove(), 5000);
            
            originalConsoleError.apply(console, args);
        };
    </script>
    
    <!-- Separate script for React components -->
    <script type="text/babel">
        try {
            ${cleanReactCode}
            
            // Render the main component with error boundary
            const root = ReactDOM.createRoot(document.getElementById('root'));
            const MainComponent = ${mainComponent.fileName.replace(/\.(jsx?|tsx?)$/, '')};
            
            root.render(
                React.createElement(ErrorBoundary, null,
                    React.createElement(MainComponent)
                )
            );
        } catch (error) {
            console.error('Render Error:', error);
            document.getElementById('root').innerHTML = \`
                <div class="error-boundary">
                    <div class="error-title">Render Error</div>
                    <div class="error-message">\${error.toString()}</div>
                </div>
            \`;
        }
    </script>
</body>
</html>`;
    }

    // Fallback to regular HTML processing with enhanced sandbox
    const htmlFile = flatFiles.find(f => f.fileName.endsWith('.html'));
    if (!htmlFile) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>No Content</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: #f5f5f5;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .no-content {
            text-align: center;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="no-content">
        <h2>No Content Available</h2>
        <p>Create some files to see the preview here.</p>
    </div>
</body>
</html>`;
    }
    
    let processedHtml = htmlFile.content;

    // Remove all external script and link references to prevent 404 errors
    processedHtml = processedHtml.replace(
        /<script[^>]*src=["'][^"']*["'][^>]*><\/script>/gi,
        ''
    );
    processedHtml = processedHtml.replace(
        /<link[^>]*href=["'][^"']*["'][^>]*>/gi,
        ''
    );

    const cssFiles = flatFiles.filter(f => f.fileName.endsWith('.css'));
    if (cssFiles.length > 0) {
        const cssContent = cssFiles.map(f => f.content).join('\n');
        processedHtml = processedHtml.replace(
            /<\/head>/,
            `<style>${cssContent}</style></head>`
        );
    }

    const jsFiles = flatFiles.filter(f => f.fileName.endsWith('.js') && !f.content.includes('React'));
    if (jsFiles.length > 0) {
        const jsContent = jsFiles.map(f => f.content).join(';\n');
        processedHtml = processedHtml.replace(
            /<\/body>/,
            `<script>
                try {
                    ${jsContent}
                } catch (error) {
                    console.error('JavaScript Error:', error);
                    document.body.innerHTML += \`
                        <div style="position: fixed; top: 10px; right: 10px; background: #fee; color: #c33; padding: 10px; border-radius: 4px; z-index: 1000; max-width: 300px; font-size: 12px;">
                            JS Error: \${error.message}
                        </div>
                    \`;
                }
            </script></body>`
        );
    }

    return processedHtml;
  }, [files]);
  
  // Resizing logic
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !mainContentRef.current) return;
      const mainRect = mainContentRef.current.getBoundingClientRect();
      const newWidthPercent = ((e.clientX - mainRect.left) / mainRect.width) * 100;
      setEditorWidth(Math.max(20, Math.min(newWidthPercent, 80)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isResizing]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-white font-sans">
      {/* Header - Responsive */}
      <header className="flex-shrink-0 flex items-center justify-between p-2 sm:p-4 border-b border-gray-700 shadow-md bg-gray-800">
        <div className="flex-1"></div>
        <h1 className="text-lg sm:text-2xl font-bold tracking-wider">
          Akvora's Code <span className="text-indigo-400">Builder</span>
        </h1>
        <div className="flex-1 flex justify-end">
          <div className="hidden sm:flex items-center text-xs text-gray-400">
            <span className="bg-gray-700 px-2 py-1 rounded">F11</span>
            <span className="ml-1">Fullscreen</span>
          </div>
        </div>
      </header>

      {/* Main Content - Enhanced Mobile Layout */}
      <main ref={mainContentRef} className="flex-grow flex flex-col lg:flex-row p-1 sm:p-2 lg:p-4 gap-1 sm:gap-2 lg:gap-4 overflow-hidden">
        {/* Desktop - Resizable Panes */}
        <div 
            className={`hidden lg:flex flex-col transition-all duration-75 ${isFullscreen ? 'w-0' : ''}`} 
            style={!isFullscreen ? { width: `${editorWidth}%` } : {}}
        >
            <CodeWorkspace 
                files={files} 
                setFiles={setFiles}
                activeFileName={activeFileName}
                setActiveFileName={setActiveFileName}
                resetProject={resetProject}
                snippets={snippets}
                isSnippetsLoading={isSnippetsLoading}
                snippetsError={snippetsError}
                onFetchSnippets={handleFetchSnippets}
            />
        </div>

        {/* Desktop Resize Handle */}
        <div 
          onMouseDown={handleMouseDown}
          className={`hidden lg:block w-2 bg-gray-700 hover:bg-indigo-500 rounded-full transition-colors cursor-col-resize flex-shrink-0 ${isFullscreen ? 'hidden' : ''}`}
          aria-hidden="true"
        ></div>

        {/* Desktop Preview */}
        <div 
            className={`hidden lg:flex flex-col transition-all duration-75 ${isFullscreen ? 'w-full' : ''}`}
            style={!isFullscreen ? { width: `${100 - editorWidth}%` } : {}}
        >
            <Preview 
              html={htmlContent} 
              isFullscreen={isFullscreen} 
              setIsFullscreen={setIsFullscreen}
            />
        </div>

        {/* Mobile - Stacked Layout */}
        <div className="flex lg:hidden flex-col flex-grow min-h-0 w-full">
            {/* Mobile Tabs - Enhanced Touch Friendly */}
            <div className="flex-shrink-0 flex border-b border-gray-700 bg-gray-800 shadow-sm">
                <button 
                    onClick={() => setMobileTab('editor')}
                    className={`flex-1 py-5 px-3 text-center text-sm sm:text-base font-medium transition-all duration-200 min-h-[60px] flex items-center justify-center ${mobileTab === 'editor' ? 'bg-indigo-600 text-white shadow-md border-b-2 border-indigo-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 active:bg-gray-700'}`}
                >
                    <span className="flex items-center justify-center gap-2">
                        Editor
                        <span className="hidden xs:inline">Editor</span>
                    </span>
                </button>
                <button 
                    onClick={() => setMobileTab('preview')}
                    className={`flex-1 py-5 px-3 text-center text-sm sm:text-base font-medium transition-all duration-200 min-h-[60px] flex items-center justify-center ${mobileTab === 'preview' ? 'bg-indigo-600 text-white shadow-md border-b-2 border-indigo-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 active:bg-gray-700'}`}
                >
                    <span className="flex items-center justify-center gap-2">
                       preview
                        <span className="hidden xs:inline">Preview</span>
                    </span>
                </button>
            </div>
            
            {/* Mobile Content Area */}
            <div className="flex-grow min-h-0 w-full">
                {mobileTab === 'editor' && (
                    <div className="h-full w-full">
                         <CodeWorkspace 
                            files={files} 
                            setFiles={setFiles}
                            activeFileName={activeFileName}
                            setActiveFileName={setActiveFileName}
                            resetProject={resetProject}
                            snippets={snippets}
                            isSnippetsLoading={isSnippetsLoading}
                            snippetsError={snippetsError}
                            onFetchSnippets={handleFetchSnippets}
                        />
                    </div>
                )}
                {mobileTab === 'preview' && (
                    <div className="h-full w-full">
                        <Preview 
                            html={htmlContent} 
                            isFullscreen={isFullscreen} 
                            setIsFullscreen={setIsFullscreen}
                        />
                    </div>
                )}
            </div>
        </div>
      </main>

      {/* Footer - Responsive */}
      <footer className="flex-shrink-0 p-2 sm:p-4">
        {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-300 p-3 rounded-lg mb-4 text-sm">
                <strong>Error:</strong> {error}
            </div>
        )}
        <InputBar
          prompt={prompt}
          setPrompt={setPrompt}
          onSubmit={() => {
            submissionSourceRef.current = 'manual';
            handleSubmitRequest();
          }}
          isLoading={isLoading || isConfirming}
          isListening={isListening}
          startListening={startListening}
          stopListening={stopListening}
        />
      </footer>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmation}
        onClose={handleCancelSubmit}
        onConfirm={handleConfirmSubmit}
        title="Replace Existing Code?"
        message={`You're about to generate new code based on: "${pendingPrompt}". This will completely replace your current code with the new generated code.`}
        confirmText="Replace Code"
        cancelText="Keep Current Code"
        isLoading={isConfirming}
      />
    </div>
  );
};

export default App;

import React, { useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { SpinnerIcon } from './Icons';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

export type EditorRef = monaco.editor.IStandaloneCodeEditor;

interface MonacoEditorProps {
  fileName: string;
  content: string;
  onChange: (value: string | undefined) => void;
  editorRef?: React.MutableRefObject<EditorRef | null>;
}

const getLanguage = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    default:
      return 'plaintext';
  }
};

export const MonacoEditor: React.FC<MonacoEditorProps> = ({ fileName, content, onChange, editorRef }) => {
  const editorInstanceRef = useRef<EditorRef | null>(null);
  const isMountedRef = useRef(true);
  const operationIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clean up editor instance to prevent cancellation errors
      if (editorInstanceRef.current) {
        try {
          // Cancel any pending operations before disposal
          const currentOperationId = ++operationIdRef.current;
          setTimeout(() => {
            if (currentOperationId === operationIdRef.current) {
              editorInstanceRef.current?.dispose();
            }
          }, 0);
        } catch (error) {
          // Ignore disposal errors
          console.debug('Monaco Editor disposal error (safe to ignore):', error);
        }
        editorInstanceRef.current = null;
      }
    };
  }, []);

  const handleEditorDidMount: OnMount = (editor) => {
    editorInstanceRef.current = editor;
    if (editorRef) {
      editorRef.current = editor;
    }

    // Add error handling for Monaco Editor API calls
    const originalDispose = editor.dispose;
    editor.dispose = function() {
      try {
        originalDispose.call(this);
      } catch (error) {
        // Ignore disposal errors that might occur during cleanup
        console.debug('Monaco Editor disposal error (safe to ignore):', error);
      }
    };

    // Handle editor model changes safely
    const model = editor.getModel();
    if (model) {
      const originalDisposeModel = model.dispose;
      model.dispose = function() {
        try {
          originalDisposeModel.call(this);
        } catch (error) {
          // Ignore model disposal errors
          console.debug('Monaco Editor model disposal error (safe to ignore):', error);
        }
      };
    }

    // Add safe undo/redo methods to the editor instance
    const safeUndo = () => {
      try {
        if (isMountedRef.current && editor && !editor.isDisposed()) {
          editor.trigger('keyboard', 'undo', null);
        }
      } catch (error) {
        console.debug('Undo operation failed (safe to ignore):', error);
      }
    };

    const safeRedo = () => {
      try {
        if (isMountedRef.current && editor && !editor.isDisposed()) {
          editor.trigger('keyboard', 'redo', null);
        }
      } catch (error) {
        console.debug('Redo operation failed (safe to ignore):', error);
      }
    };

    // Attach safe methods to the editor instance
    (editor as any).safeUndo = safeUndo;
    (editor as any).safeRedo = safeRedo;
  };

  const handleChange = (value: string | undefined) => {
    // Only call onChange if component is still mounted
    if (isMountedRef.current) {
      onChange(value);
    }
  };
  
  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        language={getLanguage(fileName)}
        value={content}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          folding: true,
          acceptSuggestionOnEnter: 'on',
          // Enhanced options to prevent cancellation errors
          suggestOnTriggerCharacters: false,
          quickSuggestions: false,
          parameterHints: { enabled: false },
          hover: { enabled: false },
          contextmenu: false,
          // Prevent cancellation errors
          readOnly: false,
          domReadOnly: false,
          // Disable features that can cause async operations
          lightbulb: { enabled: false },
          codeLens: false,
          occurrencesHighlight: false,
          selectionHighlight: false,
          renderWhitespace: 'none',
          // Optimize performance
          renderLineHighlight: 'none',
          renderIndentGuides: false,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            useShadows: false,
            verticalHasArrows: false,
            horizontalHasArrows: false,
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
        }}
        loading={<SpinnerIcon className="w-8 h-8 animate-spin text-gray-400" />}
      />
    </div>
  );
};
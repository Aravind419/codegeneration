import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon } from './Icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = `modal-title-${Math.random().toString(36).substring(2, 9)}`;

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;

      const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      setTimeout(() => {
        if(focusableElements && focusableElements.length > 0) {
          focusableElements[0].focus();
        } else {
          modalRef.current?.focus();
        }
      }, 100);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }

        if (e.key === 'Tab' && modalRef.current && focusableElements) {
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey) { // Shift + Tab
            if (document.activeElement === firstElement) {
              lastElement.focus();
              e.preventDefault();
            }
          } else { // Tab
            if (document.activeElement === lastElement) {
              firstElement.focus();
              e.preventDefault();
            }
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        triggerRef.current?.focus();
      };
    }
  }, [isOpen, onClose]);


  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby={titleId}
    >
      <div 
        ref={modalRef}
        tabIndex={-1}
        className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md animate-fade-in-up focus:outline-none"
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 id={titleId} className="text-lg font-bold text-gray-100">{title}</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white hover:bg-gray-700 rounded-full p-1.5 transition-colors"
            aria-label="Close dialog"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </header>
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
};


interface NewFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (fileName: string, folderPath?: string) => void;
  existingFiles: string[];
}

export const NewFileModal: React.FC<NewFileModalProps> = ({ isOpen, onClose, onCreate, existingFiles }) => {
  const [fileName, setFileName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFileName('');
      setFolderPath('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fileName.trim();
    const trimmedPath = folderPath.trim();
    
    if (!trimmedName) {
      setError('File name cannot be empty.');
      return;
    }

    const fullPath = trimmedPath ? `${trimmedPath}/${trimmedName}` : trimmedName;
    
    if (existingFiles.some(f => f.toLowerCase() === fullPath.toLowerCase())) {
      setError(`A file named "${fullPath}" already exists.`);
      return;
    }

    onCreate(trimmedName, trimmedPath || undefined);
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileName(e.target.value);
    if(error) setError(null);
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFolderPath(e.target.value);
    if(error) setError(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New File">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col space-y-4">
          <div>
            <label htmlFor="folderPath" className="text-gray-300">Folder Path (optional)</label>
            <input
              id="folderPath"
              type="text"
              value={folderPath}
              onChange={handleFolderChange}
              placeholder="e.g., components, src/utils"
              className="w-full bg-gray-900/50 border border-gray-600 text-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="fileName" className="text-gray-300">File Name</label>
            <input
              id="fileName"
              type="text"
              value={fileName}
              onChange={handleInputChange}
              placeholder="e.g., component.jsx"
              className={`w-full bg-gray-900/50 border text-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${error ? 'border-red-500' : 'border-gray-600'}`}
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold"
            >
              Create
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};


interface ConfirmNewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmNewProjectModal: React.FC<ConfirmNewProjectModalProps> = ({ isOpen, onClose, onConfirm }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start New Project?">
        <div className="space-y-4">
            <p className="text-gray-300">
                Are you sure? This will completely reset your workspace and clear all stored data from your browser's local storage. This action cannot be undone.
            </p>
            
            {/* Warning Box */}
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <div className="flex items-start space-x-3">
                    <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                        <h4 className="text-red-400 font-medium text-sm mb-1">Complete Reset</h4>
                        <p className="text-red-300 text-xs">
                            This will delete all files, clear your input history, and remove all data stored in your browser. You'll start with a completely clean workspace.
                        </p>
                    </div>
                </div>
            </div>
            
            <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-2 rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors font-semibold"
            >
              Confirm & Reset
            </button>
          </div>
        </div>
    </Modal>
  );
};

// Re-export ConfirmationModal for convenience
export { ConfirmationModal } from './ConfirmationModal';
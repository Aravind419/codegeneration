import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { MonacoEditor, EditorRef } from './MonacoEditor';
import { FileIcon, PlusIcon, NewProjectIcon, CloseIcon, CodeBracketIcon, SpinnerIcon, HtmlIcon, CssIcon, JsIcon, UndoIcon, RedoIcon, DownloadIcon, FolderIcon, FolderOpenIcon, ChevronRightIcon, ChevronDownIcon } from './Icons';
import { NewFileModal, ConfirmNewProjectModal } from './Modals';

export interface FileData {
  fileName: string;
  content: string;
  path?: string; // For nested folder support
  type?: 'file' | 'folder';
  children?: FileData[]; // For folders
}

interface CodeWorkspaceProps {
  files: FileData[];
  setFiles: React.Dispatch<React.SetStateAction<FileData[]>>;
  activeFileName: string;
  setActiveFileName: (fileName: string) => void;
  resetProject: () => void;
  snippets: string[];
  isSnippetsLoading: boolean;
  snippetsError: string | null;
  onFetchSnippets: (fileContent: string, fileName: string) => void;
}

const GetFileIcon: React.FC<{ fileName: string, className?: string }> = ({ fileName, className }) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const defaultClassName = "w-4 h-4";
  const combinedClassName = `${defaultClassName} ${className || ''}`;

  switch (extension) {
    case 'html':
      return <HtmlIcon className={`${combinedClassName} text-orange-400`} />;
    case 'css':
      return <CssIcon className={`${combinedClassName} text-blue-400`} />;
    case 'js':
    case 'jsx':
      return <JsIcon className={`${combinedClassName} text-yellow-400`} />;
    case 'ts':
    case 'tsx':
      return <JsIcon className={`${combinedClassName} text-cyan-400`} />;
    default:
      return <FileIcon className={`${combinedClassName} text-gray-500`} />;
  }
};

export const CodeWorkspace: React.FC<CodeWorkspaceProps> = ({
  files,
  setFiles,
  activeFileName,
  setActiveFileName,
  resetProject,
  snippets,
  isSnippetsLoading,
  snippetsError,
  onFetchSnippets,
}) => {
  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'files' | 'snippets'>('files');
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const editorRef = useRef<EditorRef | null>(null);
  
  const activeFile = files.find(f => f.fileName === activeFileName);

  // Build tree structure from flat file list
  const buildTreeStructure = (fileList: FileData[]): FileData[] => {
    const tree: FileData[] = [];
    const folderMap = new Map<string, FileData>();

    // First pass: create folders
    fileList.forEach(file => {
      if (file.path) {
        const pathParts = file.path.split('/');
        let currentPath = '';
        
        pathParts.forEach((part, index) => {
          const folderPath = currentPath ? `${currentPath}/${part}` : part;
          
          if (!folderMap.has(folderPath)) {
            const folder: FileData = {
              fileName: part,
              content: '',
              path: currentPath,
              type: 'folder',
              children: []
            };
            folderMap.set(folderPath, folder);
            
            if (currentPath === '') {
              tree.push(folder);
            } else {
              const parentFolder = folderMap.get(currentPath);
              if (parentFolder && parentFolder.children) {
                parentFolder.children.push(folder);
              }
            }
          }
          
          currentPath = folderPath;
        });
      }
    });

    // Second pass: add files to folders
    fileList.forEach(file => {
      if (file.path) {
        const parentFolder = folderMap.get(file.path);
        if (parentFolder && parentFolder.children) {
          parentFolder.children.push(file);
        }
      } else {
        tree.push(file);
      }
    });

    return tree;
  };

  const treeStructure = buildTreeStructure(files);

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  };

  const getFolderPath = (file: FileData): string => {
    return file.path ? `${file.path}/${file.fileName}` : file.fileName;
  };

  // Recursive file tree component
  const FileTreeNode: React.FC<{ 
    file: FileData; 
    level: number; 
    onFileClick: (fileName: string) => void;
    onFileDelete: (e: React.MouseEvent, fileName: string) => void;
  }> = ({ file, level, onFileClick, onFileDelete }) => {
    const isExpanded = expandedFolders.has(getFolderPath(file));
    const isActive = activeFileName === file.fileName;
    const indentStyle = { paddingLeft: `${level * 16}px` };

    if (file.type === 'folder') {
      return (
        <div>
          <div
            className="flex items-center py-2 px-3 hover:bg-gray-700/30 cursor-pointer transition-colors"
            style={indentStyle}
            onClick={() => toggleFolder(getFolderPath(file))}
          >
            <div className="flex items-center flex-grow">
              {isExpanded ? (
                <ChevronDownIcon className="w-4 h-4 text-gray-400 mr-2" />
              ) : (
                <ChevronRightIcon className="w-4 h-4 text-gray-400 mr-2" />
              )}
              {isExpanded ? (
                <FolderOpenIcon className="w-4 h-4 text-blue-400 mr-3" />
              ) : (
                <FolderIcon className="w-4 h-4 text-blue-400 mr-3" />
              )}
              <span className="text-sm text-gray-300">{file.fileName}</span>
            </div>
          </div>
          {isExpanded && file.children && (
            <div>
              {file.children.map((child, index) => (
                <FileTreeNode
                  key={`${child.fileName}-${index}`}
                  file={child}
                  level={level + 1}
                  onFileClick={onFileClick}
                  onFileDelete={onFileDelete}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        className={`group flex items-center justify-between py-2 px-3 transition-all duration-200 ${
          isActive 
            ? 'bg-indigo-600/20 border-l-2 border-indigo-400' 
            : 'hover:bg-gray-700/30'
        }`}
        style={indentStyle}
      >
        <button
          onClick={() => onFileClick(file.fileName)}
          className={`flex items-center flex-grow text-left min-w-0 ${
            isActive ? 'text-white' : 'text-gray-300'
          }`}
          aria-current={isActive ? 'page' : undefined}
        >
          <GetFileIcon fileName={file.fileName} className="mr-3 flex-shrink-0 w-4 h-4" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{file.fileName}</div>
            <div className="text-xs text-gray-500 truncate">
              {file.content.length} characters
            </div>
          </div>
        </button>
        {files.length > 1 && (
          <button 
            onClick={(e) => onFileDelete(e, file.fileName)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-600 flex-shrink-0 text-gray-400 hover:text-red-400 transition-all duration-200"
            aria-label={`Delete ${file.fileName}`}
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  // Handle escape key for editor fullscreen
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isEditorFullscreen) {
        setIsEditorFullscreen(false);
      }
    };

    if (isEditorFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isEditorFullscreen]);

  const handleContentChange = (newContent: string | undefined) => {
    if (newContent === undefined) return;
    setFiles(currentFiles =>
      currentFiles.map(file =>
        file.fileName === activeFileName ? { ...file, content: newContent } : file
      )
    );
  };

  const handleCreateFile = (fileName: string, folderPath?: string) => {
    const newFile: FileData = { 
      fileName, 
      content: '',
      type: 'file',
      path: folderPath || ''
    };
    setFiles(currentFiles => [...currentFiles, newFile]);
    setActiveFileName(fileName);
    setIsNewFileModalOpen(false);
  };

  const handleDeleteFile = (e: React.MouseEvent, fileNameToDelete: string) => {
    e.stopPropagation();
    
    setFiles(currentFiles => {
      const newFiles = currentFiles.filter(f => f.fileName !== fileNameToDelete);
      if (activeFileName === fileNameToDelete) {
        setActiveFileName(newFiles[0]?.fileName || ''); 
      }
      return newFiles;
    });
  };

  const handleConfirmReset = () => {
    resetProject();
    setIsConfirmModalOpen(false);
  };
  
  const handleSnippetInsert = (snippet: string) => {
    editorRef.current?.insertText(snippet);
  };

  const handleDownloadZip = async () => {
    try {
      const zip = new JSZip();
      
      // Helper function to add files recursively
      const addFilesToZip = (fileList: FileData[], parentPath: string = '') => {
        fileList.forEach(file => {
          if (file.type === 'folder' && file.children) {
            // Create folder and add its children
            const folderPath = parentPath ? `${parentPath}/${file.fileName}` : file.fileName;
            addFilesToZip(file.children, folderPath);
          } else {
            // Add file to zip
            const filePath = parentPath ? `${parentPath}/${file.fileName}` : file.fileName;
            zip.file(filePath, file.content);
          }
        });
      };
      
      addFilesToZip(files);
      
      const blob = await zip.generateAsync({ type: 'blob' });
      
      // Check if saveAs is available, fallback to manual download
      if (typeof saveAs === 'function') {
        saveAs(blob, 'ai-frontend-project.zip');
      } else {
        // Fallback method for browsers that don't support file-saver
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'ai-frontend-project.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to generate zip file:", error);
      // Show user-friendly error message
      alert('Failed to download project. Please try again.');
    }
  };

  // Editor fullscreen layout
  if (isEditorFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
        {/* Fullscreen Editor Header */}
        <div className="flex justify-between items-center p-4 bg-gray-800 border-b border-gray-700">
          <h2 className="font-semibold text-white text-lg">Code Editor - Fullscreen</h2>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">Press ESC to exit</span>
            <button
              onClick={() => setIsEditorFullscreen(false)}
              className="text-gray-300 hover:text-white p-2 rounded-md hover:bg-gray-700 transition-colors"
              aria-label="Exit editor fullscreen"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Fullscreen Editor Content */}
        <div className="flex-1 bg-gray-800">
          {/* File Tabs */}
          <div className="flex items-center bg-gray-800 border-b border-gray-700">
            <div className="flex items-center overflow-x-auto flex-1">
              {files.map(file => (
                <button
                  key={file.fileName}
                  onClick={() => setActiveFileName(file.fileName)}
                  className={`flex items-center space-x-2 px-4 py-3 text-sm border-r border-gray-700 transition-colors ${
                    activeFileName === file.fileName
                      ? 'bg-gray-900 text-white border-b-2 border-indigo-400'
                      : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                  }`}
                >
                  <GetFileIcon fileName={file.fileName} className="w-4 h-4" />
                  <span>{file.fileName}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center px-3 space-x-1 border-l border-gray-700">
              <button
                onClick={() => {
                  try {
                    (editorRef.current as any)?.safeUndo?.();
                  } catch (error) {
                    console.debug('Undo operation failed (safe to ignore):', error);
                  }
                }}
                className="text-gray-300 hover:text-white hover:bg-gray-700 p-2 rounded-md transition-colors"
                aria-label="Undo"
              >
                <UndoIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  try {
                    (editorRef.current as any)?.safeRedo?.();
                  } catch (error) {
                    console.debug('Redo operation failed (safe to ignore):', error);
                  }
                }}
                className="text-gray-300 hover:text-white hover:bg-gray-700 p-2 rounded-md transition-colors"
                aria-label="Redo"
              >
                <RedoIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Editor */}
          <div className="h-full">
            {activeFile ? (
              <MonacoEditor
                key={activeFile.fileName}
                editorRef={editorRef}
                fileName={activeFile.fileName}
                content={activeFile.content}
                onChange={handleContentChange}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p>No file selected.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-full bg-gray-800 rounded-lg shadow-inner border border-gray-700 overflow-hidden">
      {/* Sidebar - Responsive */}
      <div className="w-full lg:w-80 xl:w-96 flex flex-col bg-gray-900/40 border-b lg:border-b-0 lg:border-r border-gray-700 min-h-0">
        {/* Enhanced Menu Header */}
        <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700">
          {/* Main Menu Tabs */}
          <div className="flex items-center justify-between p-2 sm:p-3">
            <div role="tablist" aria-label="Sidebar View" className="flex items-center space-x-1">
                <button
                  id="files-tab"
                  role="tab"
                aria-selected={activeTab === 'files'}
                  aria-controls="files-panel"
                  onClick={() => setActiveTab('files')}
                className={`px-3 py-2 text-sm rounded-md flex items-center space-x-2 transition-colors ${
                  activeTab === 'files' 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                }`}
                >
                    <FileIcon className="w-4 h-4" />
                    <span>Files</span>
                </button>
                <button
                  id="snippets-tab"
                  role="tab"
                aria-selected={activeTab === 'snippets'}
                  aria-controls="snippets-panel"
                  onClick={() => setActiveTab('snippets')}
                className={`px-3 py-2 text-sm rounded-md flex items-center space-x-2 transition-colors ${
                  activeTab === 'snippets' 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                }`}
                >
                    <CodeBracketIcon className="w-4 h-4" />
                    <span>Snippets</span>
                </button>
            </div>
          </div>
          
          {/* Action Menu */}
          <div className="flex items-center justify-between px-2 sm:px-3 py-2 bg-gray-700/30 border-t border-gray-600">
            <div className="flex items-center space-x-1">
                <button
                    onClick={() => setIsNewFileModalOpen(true)}
                className="text-gray-300 hover:text-white hover:bg-gray-600 p-2 rounded-md transition-colors flex items-center space-x-1"
                    aria-label="New file"
                >
                <PlusIcon className="w-4 h-4" />
                <span className="text-xs hidden sm:inline">New File</span>
                </button>
                <button
                    onClick={handleDownloadZip}
                className="text-gray-300 hover:text-white hover:bg-gray-600 p-2 rounded-md transition-colors flex items-center space-x-1"
                    aria-label="Download project as zip"
                >
                <DownloadIcon className="w-4 h-4" />
                <span className="text-xs hidden sm:inline">Download</span>
                </button>
            </div>
                <button
                    onClick={() => setIsConfirmModalOpen(true)}
              className="text-gray-300 hover:text-white hover:bg-gray-600 p-2 rounded-md transition-colors flex items-center space-x-1"
                    aria-label="New project"
                >
              <NewProjectIcon className="w-4 h-4" />
              <span className="text-xs hidden sm:inline">Reset</span>
                </button>
            </div>
        </div>
        {/* Content Area */}
        <div className="flex-grow overflow-y-auto min-h-0">
            {activeTab === 'files' && (
                <div id="files-panel" role="tabpanel" aria-labelledby="files-tab" className="h-full">
                    {/* File Count Header */}
                    {files.length > 0 && (
                        <div className="px-3 py-2 bg-gray-700/20 border-b border-gray-600">
                            <span className="text-xs text-gray-400 font-medium">
                              {files.filter(f => f.type !== 'folder').length} file{files.filter(f => f.type !== 'folder').length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                    
                    {/* File Tree */}
                    <div className="divide-y divide-gray-700">
                        {treeStructure.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                                <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center mb-3">
                                    <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <h3 className="text-sm font-medium text-gray-300 mb-1">No files yet</h3>
                                <p className="text-xs text-gray-500 mb-4">Create your first file to get started</p>
                                <button
                                    onClick={() => setIsNewFileModalOpen(true)}
                                    className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors"
                                >
                                    Create File
                                </button>
                            </div>
                        ) : (
                            treeStructure.map((file, index) => (
                                <FileTreeNode
                                    key={`${file.fileName}-${index}`}
                                    file={file}
                                    level={0}
                                    onFileClick={setActiveFileName}
                                    onFileDelete={handleDeleteFile}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
            {activeTab === 'snippets' && (
                <div id="snippets-panel" role="tabpanel" aria-labelledby="snippets-tab" className="p-2 sm:p-3 space-y-2 sm:space-y-3">
                    <button 
                        onClick={() => activeFile && onFetchSnippets(activeFile.content, activeFile.fileName)}
                        disabled={isSnippetsLoading || !activeFile}
                        className="w-full bg-indigo-600 text-white px-3 py-3 sm:py-2 rounded-md font-semibold hover:bg-indigo-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed text-sm sm:text-base"
                    >
                       {isSnippetsLoading ? 'Generating...' : 'Get Suggestions'}
                    </button>
                    {isSnippetsLoading && <div className="flex justify-center p-3 sm:p-4"><SpinnerIcon className="w-5 h-5 sm:w-6 sm:h-6 animate-spin"/></div>}
                    {snippetsError && <p className="text-red-400 text-xs sm:text-sm">{snippetsError}</p>}
                    <div className="space-y-2">
                        {snippets.map((snippet, index) => (
                            <button key={index} onClick={() => handleSnippetInsert(snippet)} className="w-full text-left bg-gray-700/50 hover:bg-gray-700 p-3 sm:p-2 rounded-md transition-colors">
                                <pre className="text-xs text-gray-300 whitespace-pre-wrap truncate"><code>{snippet.split('\n')[0]}...</code></pre>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Enhanced Editor Section */}
      <div className="flex-grow flex flex-col min-w-0 bg-gray-800">
          {/* Editor Header */}
          <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700">
            {/* File Tabs */}
            <div className="flex items-center justify-between">
              <div className="flex items-center overflow-x-auto flex-1" aria-label="Open file tabs">
              {files.map(file => (
                <button
                  key={file.fileName}
                  onClick={() => setActiveFileName(file.fileName)}
                    className={`flex items-center space-x-2 px-4 py-3 text-sm border-r border-gray-700 transition-colors min-w-0 ${
                    activeFileName === file.fileName
                        ? 'bg-gray-900 text-white border-b-2 border-indigo-400'
                      : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                  }`}
                    aria-pressed={activeFileName === file.fileName}
                >
                    <GetFileIcon fileName={file.fileName} className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate max-w-32">{file.fileName}</span>
                    {files.length > 1 && (
                      <span
                        onClick={(e) => handleDeleteFile(e, file.fileName)}
                        className="ml-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-600 text-gray-400 hover:text-red-400 transition-all cursor-pointer"
                        aria-label={`Close ${file.fileName}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleDeleteFile(e, file.fileName);
                          }
                        }}
                      >
                        <CloseIcon className="w-3 h-3" />
                      </span>
                    )}
                </button>
              ))}
            </div>
              
              {/* Editor Actions */}
              <div className="flex items-center px-3 space-x-1 border-l border-gray-700">
                <button
                    onClick={() => {
                      try {
                        (editorRef.current as any)?.safeUndo?.();
                      } catch (error) {
                        console.debug('Undo operation failed (safe to ignore):', error);
                      }
                    }}
                  className="text-gray-300 hover:text-white hover:bg-gray-700 p-2 rounded-md transition-colors"
                    aria-label="Undo"
                >
                  <UndoIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={() => {
                      try {
                        (editorRef.current as any)?.safeRedo?.();
                      } catch (error) {
                        console.debug('Redo operation failed (safe to ignore):', error);
                      }
                    }}
                  className="text-gray-300 hover:text-white hover:bg-gray-700 p-2 rounded-md transition-colors"
                    aria-label="Redo"
                >
                  <RedoIcon className="w-4 h-4" />
                </button>
                <div className="w-px h-6 bg-gray-600 mx-1"></div>
                <button
                  onClick={() => setIsEditorFullscreen(!isEditorFullscreen)}
                  className="text-gray-300 hover:text-white hover:bg-gray-700 p-2 rounded-md transition-colors"
                  aria-label={isEditorFullscreen ? "Exit editor fullscreen" : "Enter editor fullscreen"}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex-grow relative">
            {activeFile ? (
              <MonacoEditor
                key={activeFile.fileName}
                editorRef={editorRef}
                fileName={activeFile.fileName}
                content={activeFile.content}
                onChange={handleContentChange}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p>No file selected.</p>
              </div>
            )}
          </div>
      </div>


      <NewFileModal 
        isOpen={isNewFileModalOpen}
        onClose={() => setIsNewFileModalOpen(false)}
        onCreate={handleCreateFile}
        existingFiles={files.map(f => f.fileName)}
      />

      <ConfirmNewProjectModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmReset}
      />
    </div>
  );
};

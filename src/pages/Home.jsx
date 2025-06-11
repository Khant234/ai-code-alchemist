import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, AlertTriangle, CheckCircle, Brain, XCircle, FileArchive } from 'lucide-react';
import ReactMarkdown from 'react-markdown'; // ADD THIS
import remarkGfm from 'remark-gfm'; 

// issueSeverityStyles remains the same as your last version
const issueSeverityStyles = {
  low: {
    borderColor: 'border-l-green-400',
    bgColor: 'bg-green-500/10',
    textColor: 'text-green-300',
    icon: <CheckCircle size={18} className="text-green-400 mr-2" />
  },
  medium: {
    borderColor: 'border-l-yellow-400',
    bgColor: 'bg-yellow-500/10',
    textColor: 'text-yellow-300',
    icon: <AlertTriangle size={18} className="text-yellow-400 mr-2" />
  },
  high: {
    borderColor: 'border-l-red-400',
    bgColor: 'bg-red-500/10',
    textColor: 'text-red-300',
    icon: <AlertTriangle size={18} className="text-red-400 mr-2" />
  },
  info: {
    borderColor: 'border-l-blue-400',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-300',
    icon: <Brain size={18} className="text-blue-400 mr-2" />
  },
  default: {
    borderColor: 'border-l-gray-400',
    bgColor: 'bg-gray-500/10',
    textColor: 'text-gray-300',
    icon: null
  }
};


function Home() {
  const [inputCode, setInputCode] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [outputCode, setOutputCode] = useState('');
  const [issues, setIssues] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (file) {
      setFileName(file.name);
      setUploadedFile(file);
      setIssues([]);
      setOutputCode('');

      if (!file.name.endsWith('.zip')) {
        setIsLoading(true);
        try {
          const text = await file.text();
          setInputCode(text);
        } catch (error) {
          console.error("Error reading file:", error);
          setIssues([{ id: Date.now(), type: 'Frontend Error', message: `Failed to read file: ${error.message}`, severity: 'high' }]);
          clearFile();
        }
        setIsLoading(false);
      } else {
        setInputCode('');
        setIssues([{ id: Date.now(), type: 'Info', message: `ZIP file '${file.name}' selected. Analysis will process the archive. (Note: Current backend only processes text input, zip handling is a future step).`, severity: 'info' }]);
      }
    }
  };

  const clearFile = () => {
    setFileName('');
    setUploadedFile(null);
    setInputCode('');
    setIssues([]);
    setOutputCode('');
    if (fileInputRef.current) {
      fileInputRef.current.value = null;
    }
  };

  // --- MODIFIED handleAnalyzeCode to parse JSON ---
  const handleAnalyzeCode = async () => {
    let codeToAnalyze = inputCode;

    if (uploadedFile && uploadedFile.name.endsWith('.zip')) {
      alert("ZIP file analysis requires backend enhancement. Please paste code or upload a single text-based code file for now.");
      return;
    }

    if (!codeToAnalyze.trim()) {
      alert("Please upload a single code file or paste code into the textarea to analyze.");
      return;
    }

    setIsLoading(true);
    setOutputCode('');
    setIssues([]);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: codeToAnalyze }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response from backend.' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json(); // This 'data' object now contains { analysis: parsedAnalysis, parsed: true } or { analysis: rawText, parsed: false }

      const newIssues = [];
      if (data.parsed) { // If the backend successfully parsed the AI's JSON
        // Process Bugs
        data.analysis.bugs.forEach((bug, index) => {
          newIssues.push({
            id: `bug-${index}-${Date.now()}`,
            type: 'Bug',
            message: bug.message,
            line: bug.line || 'N/A',
            severity: bug.severity || 'high' // Default to high if not specified
          });
        });

        // Process Improvements
        data.analysis.improvements.forEach((imp, index) => {
          newIssues.push({
            id: `imp-${index}-${Date.now()}`,
            type: 'Improvement',
            message: imp.message,
            line: imp.line || 'N/A',
            severity: imp.severity || 'medium' // Default to medium
          });
        });

        // Process Explanations
        data.analysis.explanations.forEach((exp, index) => {
          newIssues.push({
            id: `exp-${index}-${Date.now()}`,
            type: 'Explanation',
            message: exp.message,
            line: exp.line || 'N/A',
            severity: exp.severity || 'info' // Default to info
          });
        });

        // Set a general info message if no issues were found
        if (newIssues.length === 0) {
            newIssues.push({
                id: `no-issues-${Date.now()}`,
                type: 'AI Analysis',
                message: 'No significant bugs, improvements, or explanations found. Code looks good!',
                line: 'N/A',
                severity: 'info'
            });
        }

        setOutputCode('// AI Analysis successfully structured below.'); // Indicate structured output
      } else {
        // Fallback: If AI didn't return valid JSON, display its raw text as one large issue
        newIssues.push({
          id: Date.now(),
          type: 'AI Analysis (Raw)',
          message: `The AI response could not be fully parsed into structured categories. Here is the raw analysis:\n\n${data.analysis}`,
          line: 'N/A',
          severity: 'info'
        });
        setOutputCode('// AI Analysis (raw) displayed below due to parsing issues.'); // Indicate raw output
      }

      setIssues(newIssues);

    } catch (error) {
      console.error("Error analyzing code:", error);
      setIssues([{
        id: Date.now(),
        type: 'Error',
        message: error.message || 'An unknown error occurred during analysis.',
        line: 'N/A',
        severity: 'high'
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  // --- END OF MODIFIED handleAnalyzeCode ---

  const isZipFile = fileName.endsWith('.zip');
  const displayFileName = fileName.length > 30 ? `${fileName.substring(0,15)}...${fileName.substring(fileName.length-12)}` : fileName;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 p-4 sm:p-8 flex items-center justify-center font-sans">
      <div className="w-full max-w-5xl bg-black/50 backdrop-blur-2xl rounded-2xl shadow-2xl p-6 sm:p-10 text-neutral-100 border border-white/20">
        <header className="text-center mb-8 sm:mb-12">
           <h1 className="text-4xl sm:text-5xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-red-400">
            Codebase Alchemist AI
          </h1>
          <p className="text-neutral-300 text-base sm:text-lg">
            Upload your codebase (zip recommended) or paste code for AI-driven analysis.
          </p>
        </header>

        <main>
          <section className="mb-8 p-6 bg-white/10 backdrop-blur-sm rounded-xl border border-white/10">
            <div className="flex flex-col items-center">
                <label
                  htmlFor="file-upload"
                  className="w-full max-w-md cursor-pointer flex flex-col items-center justify-center px-6 py-8 border-2 border-dashed border-purple-400/50 rounded-lg text-purple-300 hover:text-white hover:border-purple-400 hover:bg-purple-500/20 transition-all duration-300"
                >
                  {fileName ? (
                    isZipFile ? <FileArchive size={36} className="mb-3 text-pink-400" /> : <FileText size={36} className="mb-3 text-pink-400" />
                  ) : (
                    <UploadCloud size={36} className="mb-3" />
                  )}
                  <span className="text-center text-sm sm:text-base">
                    {fileName ? `Selected: ${displayFileName}` : "Upload Codebase (ZIP) or Single File"}
                  </span>
                  {!fileName && <span className="text-xs text-neutral-400 mt-1">Or paste single file content below</span>}
                </label>
                <input
                  id="file-upload"
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  onChange={handleFileChange}
                  accept=".zip,.js,.jsx,.ts,.tsx,.html,.css,.py,.java,.cs,.php,.rb,.go,.rs,.swift,.kt,.m,.c,.cpp,.h,.hpp"
                  disabled={isLoading}
                />
                 {fileName && (
                  <button
                    onClick={clearFile}
                    className="mt-4 text-xs text-red-400 hover:text-red-300 flex items-center"
                    disabled={isLoading}
                  >
                    <XCircle size={14} className="mr-1" /> Clear Selection
                  </button>
                )}
            </div>
            
            {!isZipFile && (
                <textarea
                className="mt-6 w-full p-4 bg-black/20 border border-white/10 rounded-lg font-mono text-sm min-h-[150px] sm:min-h-[200px] text-neutral-200 focus:ring-1 focus:ring-purple-400 focus:border-purple-400 placeholder-neutral-400 disabled:opacity-60"
                placeholder={fileName ? "Code from uploaded file shown here..." : "Or paste single file content directly here..."}
                value={inputCode}
                onChange={(e) => {
                    setInputCode(e.target.value);
                    if (fileName) clearFile();
                }}
                rows={8}
                disabled={isLoading || (!!fileName && !inputCode)}
                />
            )}

            <button
              className="mt-8 w-full bg-gradient-to-r from-purple-600 via-pink-500 to-red-500 hover:from-purple-700 hover:via-pink-600 hover:to-red-600 text-white font-semibold py-3.5 px-4 rounded-lg shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 disabled:opacity-60 disabled:transform-none flex items-center justify-center text-lg"
              onClick={handleAnalyzeCode}
              disabled={isLoading || (!inputCode.trim() && !uploadedFile)}
            >
              {isLoading && (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {isLoading ? 'Summoning AI Wisdom...' : 'Analyze My Code'}
            </button>
          </section>

          {!isLoading && (outputCode || issues.length > 0) && (
            <section className="mt-10 p-6 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
              <h2 className="text-2xl sm:text-3xl font-semibold text-purple-300 mb-6 flex items-center">
                <Brain size={28} className="mr-3 text-pink-400"/>
                AI Analysis Report
              </h2>
              {/* Optional: Display a general message about the output */}
              {outputCode && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-neutral-200 mb-3 flex items-center">
                    <FileText size={20} className="mr-2 text-purple-300"/> Report Summary:
                  </h3>
                  <pre className="bg-black/30 p-4 rounded-lg shadow-inner overflow-x-auto font-mono text-sm text-neutral-200 border border-white/10 max-h-96">
                    <code>{outputCode}</code>
                  </pre>
                </div>
              )}
              
              {issues.length > 0 && (
                <div>
                  <h3 className="text-xl font-semibold text-neutral-200 mb-4 flex items-center">
                    <AlertTriangle size={20} className="mr-2 text-yellow-300"/> Key Findings & Suggestions:
                  </h3>
                  <ul className="space-y-3">
                    {issues.map(issue => {
                      const styles = issueSeverityStyles[issue.severity] || issueSeverityStyles.default;
                      return (
                        <li
                          key={issue.id}
                          className={`p-4 rounded-lg shadow-md border-l-4 flex items-start ${styles.borderColor} ${styles.bgColor}`}
                        >
                          {styles.icon}
                          <div>
                            <span className={`font-semibold block mb-1 ${styles.textColor}`}>
                              {issue.type}
                              {issue.line !== 'N/A' && <span className="font-normal text-neutral-400 text-xs ml-2">({issue.line})</span>}
                            </span>
                            {/* Render message as preformatted if it's AI analysis for better readability of code blocks etc. */}
                            <div className="text-neutral-300 text-sm prose prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-1"> {/* Added prose classes for basic markdown styling */}
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {issue.message}
                              </ReactMarkdown>
                              </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          )}
        </main>
        <footer className="text-center mt-12 pt-6 border-t border-white/10">
          <p className="text-sm text-neutral-400">
            &copy; {new Date().getFullYear()} Codebase Alchemist AI. Verify all AI-generated suggestions.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default Home;

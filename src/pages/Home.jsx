import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileText, AlertTriangle, CheckCircle, Brain, XCircle, FileArchive, ShieldAlert } from 'lucide-react'; // ADD ShieldAlert icon
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';


// Utility throttle function to prevent rapid repeated calls
function throttle(fn, delay) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), delay);
    }
  };
}


// Helper function to generate a more unique ID than just generateUniqueId()
const generateUniqueId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// issueSeverityStyles remains the same
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
  critical: { // NEW SEVERITY for security
    borderColor: 'border-l-red-600',
    bgColor: 'bg-red-600/15',
    textColor: 'text-red-200',
    icon: <ShieldAlert size={18} className="text-red-400 mr-2" /> // Use ShieldAlert for critical security
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

  // --- ADD THIS REF FOR DEBOUNCING ---
  const isProcessingRef = useRef(false); // Flag to immediately check if a request is in progress

  // Throttled version of handleAnalyzeCode
const throttledAnalyzeCode = useCallback(
  throttle(() => {
    handleAnalyzeCode();
  }, 3000), // Only allow once every 3 seconds
  [inputCode, uploadedFile, fileName] // Include dependencies
);

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
          setIssues([{ id: generateUniqueId(), type: 'Frontend Error', message: `Failed to read file: ${error.message}`, severity: 'high' }]);
          clearFile();
        }
        setIsLoading(false);
      } else {
        setInputCode('');
        setIssues([{ id: generateUniqueId(), type: 'Info', message: `ZIP file '${file.name}' selected. Analysis will process the archive. (Note: Current backend only processes text input, zip handling is a future step).`, severity: 'info' }]);
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

  // src/App.js (inside your App component, replace the handleAnalyzeCode function)

const handleAnalyzeCode = async () => {
  console.count('handleAnalyzeCode called');
  console.log('handleAnalyzeCode called at:', new Date().toISOString());

    // Determine the data to send: uploaded file or pasted code
    let requestBody;
    let contentType;

    if (uploadedFile) {
        // If a file is uploaded, use FormData
        const formData = new FormData();
        formData.append('codeFile', uploadedFile); // 'codeFile' will be the field name on the backend

        // If there's also pasted code (e.g., user pasted, then uploaded),
        // prioritize the file for analysis, but send original text as fallback/context.
        // Or, you might decide to clear pasted code if a file is uploaded.
        // For now, we'll send the file and let backend handle it.
        // If the user pastes AND uploads a non-zip, we'll analyze the file.
        // If the user pastes AND uploads a zip, we'll analyze the zip.
        // If only paste, we'll analyze the paste.
        // This is important: clear inputCode if a file is going to be sent for clarity
        // (This logic is already in handleFileChange, but confirm)
        // If inputCode is from a non-zip, and then Analyze is clicked, we'll send the file.

        requestBody = formData;
        contentType = undefined; // browser will set 'multipart/form-data' automatically with FormData
    } else if (inputCode.trim()) {
        // If only code is pasted, send as JSON
        requestBody = JSON.stringify({ code: inputCode });
        contentType = 'application/json';
    } else {
        // No file and no pasted code
        alert("Please upload a file or paste code into the textarea to analyze.");
        return;
    }

    setIsLoading(true);
    setOutputCode('');
    setIssues([]);

    try {
      const fetchOptions = {
        method: 'POST',
        body: requestBody,
      };

      if (contentType) {
        fetchOptions.headers = { 'Content-Type': contentType };
      }

      const response = await fetch('/api/analyze', fetchOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response from backend.' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      console.log("Raw data from backend:", data); // See everything the backend sent
        if (data.parsed) {
            console.log("AI analysis (parsed JSON):", data.analysis); // See the parsed JSON object
            console.log("AI bugs array:", data.analysis.bugs); // See just the bugs array
        } else {
            console.log("AI analysis (raw text, parsing failed):", data.analysis); // See raw text if parsing failed
        }

      const newIssues = [];
      if (data.parsed) {
        data.analysis.bugs.forEach((bug, index) => {
          newIssues.push({
            id: `bug-${index}-${generateUniqueId()}`, // Use a unique ID for each issue to avoid duplicates
            type: 'Bug',
            message: bug.message,
            line: bug.line || 'N/A',
            severity: bug.severity || 'high',
            suggestedFix: bug.suggestedFix || null
          });
        });

        data.analysis.security_vulnerabilities.forEach((secVuln, index) => {
          newIssues.push({
            id: `sec-${index}-${generateUniqueId()}`, // Use a unique ID for each issue to avoid duplicates
            type: 'Security Vulnerability',
            message: secVuln.message,
            line: secVuln.line || 'N/A',
            severity: secVuln.severity || 'critical',
            suggestedFix: secVuln.suggestedFix || null
          });
        });

        data.analysis.improvements.forEach((imp, index) => {
          newIssues.push({
            id: `imp-${index}-${generateUniqueId()}`, // Use a unique ID for each issue to avoid duplicates
            type: 'Improvement',
            message: imp.message,
            line: imp.line || 'N/A',
            severity: imp.severity || 'medium',
            suggestedFix: imp.suggestedFix || null
          });
        });

        data.analysis.explanations.forEach((exp, index) => {
          newIssues.push({
            id: `exp-${index}-${generateUniqueId()}`, // Use a unique ID for each issue to avoid duplicates
            type: 'Explanation',
            message: exp.message,
            line: exp.line || 'N/A',
            severity: exp.severity || 'info',
            suggestedFix: exp.suggestedFix || null
          });
        });

        if (newIssues.length === 0) {
            newIssues.push({
                id: `no-issues-${generateUniqueId()}`,
                type: 'AI Analysis',
                message: 'No significant issues or improvements found. Code looks good!',
                line: 'N/A',
                severity: 'info'
            });
        }

        const currentAnalysisFilePath = data.message.startsWith('Analyzing key file from ZIP:')
                                ? data.message.split(': ')[1].split(' ')[0] // Extract filename from message like "Analyzing key file from ZIP: my-file.js"
                                : (data.message.startsWith('Analyzing single file:')
                                    ? data.message.split(': ')[1].split('.')[0] + '.' + data.message.split(': ')[1].split('.')[1].split(' ')[0] // Extract filename from message like "Analyzing single file: my-file.js"
                                    : (fileName || 'Pasted Code') // Fallback to fileName or 'Pasted Code'
                                );


// Process Bugs
data.analysis.bugs.forEach((bug, index) => {
  newIssues.push({
    id: `bug-${index}-${generateUniqueId()}`,
    type: 'Bug',
    message: bug.message,
    line: bug.line || 'N/A',
    severity: bug.severity || 'high',
    suggestedFix: bug.suggestedFix || null,
    filePath: bug.filePath || currentAnalysisFilePath // Add filePath here
  });
});

// Process Security Vulnerabilities
data.analysis.security_vulnerabilities.forEach((secVuln, index) => {
  newIssues.push({
    id: `sec-${index}-${generateUniqueId()}`,
    type: 'Security Vulnerability',
    message: secVuln.message,
    line: secVuln.line || 'N/A',
    severity: secVuln.severity || 'critical',
    suggestedFix: secVuln.suggestedFix || null,
    filePath: secVuln.filePath || currentAnalysisFilePath // Add filePath here
  });
});

// Process Improvements
data.analysis.improvements.forEach((imp, index) => {
  newIssues.push({
    id: `imp-${index}-${generateUniqueId()}`,
    type: 'Improvement',
    message: imp.message,
    line: imp.line || 'N/A',
    severity: imp.severity || 'medium',
    suggestedFix: imp.suggestedFix || null,
    filePath: imp.filePath || currentAnalysisFilePath // Add filePath here
  });
});

// Process Explanations
data.analysis.explanations.forEach((exp, index) => {
  newIssues.push({
    id: `exp-${index}-${generateUniqueId()}`,
    type: 'Explanation',
    message: exp.message,
    line: exp.line || 'N/A',
    severity: exp.severity || 'info',
    suggestedFix: exp.suggestedFix || null,
    filePath: exp.filePath || currentAnalysisFilePath // Add filePath here
  });
});

        // For zip files, outputCode could be a message about processed files
        setOutputCode(data.message || '// AI Analysis successfully structured below.');
      } else {
        newIssues.push({
          id: generateUniqueId(),
          type: 'AI Analysis (Raw)',
          message: `The AI response could not be fully parsed into structured categories. Here is the raw analysis:\n\n${data.analysis}`,
          line: 'N/A',
          severity: 'info'
        });
        setOutputCode(data.message || '// AI Analysis (raw) displayed below due to parsing issues.');
      }

      setIssues(newIssues);

    } catch (error) {
      console.error("Error analyzing code:", error);
      setIssues([{
        id: generateUniqueId(),
        type: 'Error',
        message: error.message || 'An unknown error occurred during analysis.',
        line: 'N/A',
        severity: 'high'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

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
              onClick={throttledAnalyzeCode}
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
                      // Dynamically choose style based on severity, defaulting if missing
                      const styles = issueSeverityStyles[issue.severity] || issueSeverityStyles.default;
                      return (
                        <li
                          key={issue.id}
                          className={`p-4 rounded-lg shadow-md border-l-4 flex items-start ${styles.borderColor} ${styles.bgColor}`}
                        >
                          {styles.icon}
                          <div className="flex-1  min-w-0"> {/* Added flex-1 to push suggested fix to right */}
                            <span className={`font-semibold block mb-1 ${styles.textColor}`}>
                              {issue.type}
                              {issue.line !== 'N/A' && <span className="font-normal text-neutral-400 text-xs ml-2">({issue.line})</span>}
                              {issue.filePath && issue.filePath !== 'N/A' && (
          <span className="font-normal text-neutral-400 text-xs ml-2"> (File: {issue.filePath})</span>
      )}
                            </span>
                            <div className="text-neutral-300 text-sm prose prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-1">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {issue.message}
                                </ReactMarkdown>
                            </div>
                            {issue.suggestedFix && issue.suggestedFix !== "N/A" && ( // NEW: Display suggestedFix
                              <div className="mt-3 p-3 bg-white/5 border border-white/10 rounded-md text-neutral-400 text-xs font-mono  w-full">
                                <h4 className="font-semibold text-neutral-300 mb-1">Suggested Fix:</h4>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {`\`\`\`\n${issue.suggestedFix}\n\`\`\``}
                                </ReactMarkdown>
                              </div>
                            )}
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






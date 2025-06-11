// api/analyze.js

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false,
  },
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    const form = formidable({
      keepExtensions: true,
      maxFileSize: 4.5 * 1024 * 1024, // 4.5MB max file size
      uploadDir: os.tmpdir(),
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        return reject(err);
      }
      resolve({ fields, files });
    });
  });
};

const SUPPORTED_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.py', '.java', '.cs',
  '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.m', '.c', '.cpp', '.h', '.hpp'
];

async function getCodeFilesFromDirectory(dirPath) {
    let codeFiles = []; // Stores { fullPath, relativePath, size }
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.relative(dirPath, fullPath); // Relative path from extraction root
            if (entry.isFile()) {
                if (SUPPORTED_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
                    const stats = await fs.stat(fullPath);
                    codeFiles.push({ fullPath, relativePath, size: stats.size });
                }
            } else if (entry.isDirectory()) {
                if (!['node_modules', 'dist', 'build', '.git', '.next', '.vercel', 'coverage', 'tmp', 'public', '.yarn', 'vendor'].includes(entry.name.toLowerCase())) {
                    codeFiles = codeFiles.concat(await getCodeFilesFromDirectory(fullPath));
                }
            }
        }
    } catch (err) {
        console.error(`Error reading directory ${dirPath}:`, err);
    }
    return codeFiles;
}

export default async function handler(req, res) {

  console.log('[api/analyze.js] Request received for AI analysis.');
  console.log('[api/analyze.js] GEMINI_API_KEY loaded:', process.env.GEMINI_API_KEY ? 'Yes' : 'No/Empty');

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  let userCode = '';
  let analysisMessage = '';
  let tempCleanupPath = null;

  try {
    const contentType = req.headers['content-type'];
    let isFileUpload = contentType && contentType.includes('multipart/form-data');

    if (isFileUpload) {
      console.log('[api/analyze.js] Handling file upload...');
      const { files } = await parseForm(req);
      const uploadedFile = files.codeFile ? (Array.isArray(files.codeFile) ? files.codeFile[0] : files.codeFile) : null;

      if (!uploadedFile) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }

      tempCleanupPath = uploadedFile.filepath;
      const originalFileName = uploadedFile.originalFilename || 'uploaded_file';
      
      if (originalFileName.toLowerCase().endsWith('.zip')) {
        console.log(`[api/analyze.js] Processing ZIP file: ${originalFileName}`);
        const zip = new AdmZip(uploadedFile.filepath);
        const tempExtractionDir = path.join(os.tmpdir(), `zip-extract-${Date.now()}`);
        await fs.mkdir(tempExtractionDir, { recursive: true });
        zip.extractAllTo(tempExtractionDir, true);

        tempCleanupPath = tempExtractionDir;

        let allCodeFiles = await getCodeFilesFromDirectory(tempExtractionDir);

        // --- NEW: Multi-File Analysis Strategy ---
        const MAX_CONTEXT_LENGTH = 900 * 1024; // Roughly conservative token limit for Gemini-Pro-Flash, adjust based on actual usage/cost
        let combinedCode = [];
        let combinedCodeLength = 0;
        let filesAnalyzedCount = 0;

        // Sort files by size (largest first) to prioritize more substantial files
        allCodeFiles.sort((a, b) => b.size - a.size);

        for (const fileObj of allCodeFiles) {
            const fileContent = await fs.readFile(fileObj.fullPath, 'utf8');
            // Estimate token count: rough estimate 4 chars per token.
            // Be very conservative as actual tokenization is complex.
            const estimatedTokens = fileContent.length / 4;

            if (combinedCodeLength + estimatedTokens < MAX_CONTEXT_LENGTH) {
                // Add a header for each file to distinguish them in the prompt
                combinedCode.push(`// --- Start of file: ${fileObj.relativePath} ---\n`);
                combinedCode.push(fileContent);
                combinedCode.push(`// --- End of file: ${fileObj.relativePath} ---\n\n`);
                combinedCodeLength += estimatedTokens;
                filesAnalyzedCount++;
            } else {
                console.warn(`[api/analyze.js] Skipping file due to context limit: ${fileObj.relativePath}`);
                break; // Stop adding files if we hit the limit
            }
        }

        if (filesAnalyzedCount > 0) {
            userCode = combinedCode.join('\n');
            analysisMessage = `Analyzing codebase from ZIP: ${originalFileName} (processed ${filesAnalyzedCount} key files).`;
        } else {
            analysisMessage = `No supported code files found in ZIP: ${originalFileName} or files too large for analysis.`;
            userCode = `/* No supported code files (.js, .py, etc.) found in the uploaded ZIP archive or files exceed AI context limit.
Please ensure your ZIP contains valid code files for analysis, or paste single file content. */`;
        }

      } else {
        userCode = await fs.readFile(uploadedFile.filepath, 'utf8');
        analysisMessage = `Analyzing single file: ${originalFileName}.`;
      }
    } else {
      userCode = req.body.code;
      analysisMessage = 'Analyzing pasted code.';
    }

    if (!userCode || typeof userCode !== 'string' || userCode.trim() === '') {
      return res.status(400).json({ error: 'No code content found for analysis.' });
    }

    // --- MODIFIED PROMPT FOR MULTI-FILE CONTEXT ---
    // Emphasize that it's a codebase and to include filePath in output
    const prompt = `You are an expert AI security auditor and code refactoring specialist for web development.
You are analyzing a codebase, which may contain multiple files concatenated.
Analyze the following code, identifying potential bugs, security vulnerabilities, and major improvements.
For each item, specify the 'filePath' if it's explicitly identified in the code provided (e.g., '// --- Start of file: path/to/file.js ---'), otherwise use "N/A".
Provide a concise explanation and, if applicable, a specific code fix.

Your response MUST be a single, valid JSON object. Do NOT include any other text, markdown, or conversational elements outside the JSON.
The JSON object MUST have the following structure:
{
  "bugs": [
    { "message": "Short description of bug and its cause.", "line": "Line number or N/A", "severity": "high/medium/low", "suggestedFix": "Code snippet of the fix or N/A", "filePath": "path/to/file.js or N/A" } // filePath added
  ],
  "security_vulnerabilities": [
    { "message": "Description of vulnerability and impact.", "line": "Line number or N/A", "severity": "critical/high/medium", "suggestedFix": "Code snippet of the fix or N/A", "filePath": "path/to/file.js or N/A" } // filePath added
  ],
  "improvements": [
    { "message": "Description of improvement and why it's useful.", "line": "Line number or N/A", "severity": "medium/low", "suggestedFix": "Code snippet of the fix or N/A", "filePath": "path/to/file.js or N/A" } // filePath added
  ],
  "explanations": [
    { "message": "Explanation of concept.", "line": "Line number or N/A", "severity": "info", "filePath": "path/to/file.js or N/A" } // filePath added
  ]
}

Ensure all messages are concise and actionable. If no items fit a category, provide an empty array for that category.
For line numbers, use "line": "15" or "line": "N/A" for general issues.
The 'suggestedFix' should be a runnable code snippet if a direct fix is possible, otherwise "N/A".
Prioritize critical security issues.

Code to analyze:
\`\`\`
${userCode}
\`\`\``;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let aiResponseText = response.text();

    // --- Robust JSON Extraction (unchanged) ---
    const jsonMatch = aiResponseText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
        aiResponseText = jsonMatch[1];
    } else {
        const rawJsonMatch = aiResponseText.match(/(\{[\s\S]*?\})/);
        if (rawJsonMatch && rawJsonMatch[1]) {
            aiResponseText = rawJsonMatch[1];
        }
    }

    let parsedAnalysis = {
        bugs: [],
        security_vulnerabilities: [],
        improvements: [],
        explanations: []
    };
    let parseSuccess = false;

    try {
        const tempParsed = JSON.parse(aiResponseText);
        if (tempParsed.bugs && Array.isArray(tempParsed.bugs) &&
            tempParsed.security_vulnerabilities && Array.isArray(tempParsed.security_vulnerabilities) &&
            tempParsed.improvements && Array.isArray(tempParsed.improvements) &&
            tempParsed.explanations && Array.isArray(tempParsed.explanations)) {
            parsedAnalysis = tempParsed;
            parseSuccess = true;
        } else {
            console.warn("AI returned JSON but not with the expected top-level keys. Falling back to raw text.");
        }
    } catch (parseError) {
        console.error("Failed to parse AI response as JSON:", parseError);
        console.error("Raw AI response leading to parse error:", aiResponseText);
    }

    res.status(200).json({
      analysis: parsedAnalysis,
      parsed: parseSuccess,
      message: analysisMessage
    });

  } catch (error) {
    console.error('[api/analyze.js] Error in file processing or AI call:', error);

    let errorMessage = 'Failed to analyze code due to an internal server error.';
    if (error.message && error.message.includes("API key")) {
        errorMessage = "Google AI API key is missing or invalid.";
    } else if (error.message) {
      errorMessage = error.message;
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
        errorMessage = `File too large. Maximum allowed is 4.5MB.`;
        res.status(413).json({ error: errorMessage });
        return;
    }

    res.status(500).json({ error: errorMessage });
  } finally {
    if (tempCleanupPath) {
      try {
        const stats = await fs.stat(tempCleanupPath);
        if (stats.isDirectory()) {
          await fs.rm(tempCleanupPath, { recursive: true, force: true });
          console.log(`[api/analyze.js] Cleaned up temporary directory: ${tempCleanupPath}`);
        } else if (stats.isFile()) {
          await fs.unlink(tempCleanupPath);
          console.log(`[api/analyze.js] Cleaned up temporary file: ${tempCleanupPath}`);
        }
      } catch (cleanupError) {
        console.error(`[api/analyze.js] Error during cleanup of ${tempCleanupPath}:`, cleanupError);
      }
    }
  }
}
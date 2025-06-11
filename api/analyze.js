// api/analyze.js

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Ensure this is your working model

export default async function handler(req, res) {
  console.log('[api/analyze.js] Request received for AI analysis.');
  console.log('[api/analyze.js] GEMINI_API_KEY loaded:', process.env.GEMINI_API_KEY ? 'Yes' : 'No/Empty');

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { code: userCode } = req.body;

    if (!userCode || typeof userCode !== 'string' || userCode.trim() === '') {
      return res.status(400).json({ error: 'Code is required and must be a non-empty string.' });
    }

    // --- MODIFIED PROMPT FOR SECURITY FOCUS & CODE FIXES ---
    const prompt = `You are an expert AI security auditor and code refactoring specialist for web development.
Analyze the following code snippet specifically for **security vulnerabilities**, **potential bugs**, and **major improvements** for robustness and maintainability.
For each issue identified, provide a concise explanation and, if applicable, a **specific code fix** that can be directly applied.

Your response MUST be a single, valid JSON object. Do NOT include any other text, markdown, or conversational elements outside the JSON.
The JSON object MUST have the following structure:
{
  "bugs": [
    { "message": "Short description of bug and its cause.", "line": "Line number or N/A", "severity": "high/medium/low", "suggestedFix": "Code snippet of the fix or N/A" }
  ],
  "security_vulnerabilities": [ // NEW CATEGORY
    { "message": "Description of vulnerability and impact.", "line": "Line number or N/A", "severity": "critical/high/medium", "suggestedFix": "Code snippet of the fix or N/A" }
  ],
  "improvements": [
    { "message": "Description of improvement and why it's useful.", "line": "Line number or N/A", "severity": "medium/low", "suggestedFix": "Code snippet of the fix or N/A" }
  ],
  "explanations": [
    { "message": "Explanation of concept.", "line": "Line number or N/A", "severity": "info" }
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

    // --- Robust JSON Extraction (unchanged, still needed) ---
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
        security_vulnerabilities: [], // Initialize new category
        improvements: [],
        explanations: []
    };
    let parseSuccess = false;

    try {
        const tempParsed = JSON.parse(aiResponseText);
        // Validate top-level keys for the new structure
        if (tempParsed.bugs && Array.isArray(tempParsed.bugs) &&
            tempParsed.security_vulnerabilities && Array.isArray(tempParsed.security_vulnerabilities) && // Validate new category
            tempParsed.improvements && Array.isArray(tempParsed.improvements) &&
            tempParsed.explanations && Array.isArray(tempParsed.explanations)) {

            parsedAnalysis = tempParsed; // If validation passes, use the parsed object
            parseSuccess = true;
        } else {
            console.warn("AI returned JSON but not with the expected top-level keys. Falling back to raw text.");
        }
    } catch (parseError) {
        console.error("Failed to parse AI response as JSON:", parseError);
        console.error("Raw AI response leading to parse error:", aiResponseText);
    }

    // --- Send the results back to the frontend ---
    res.status(200).json({
      analysis: parseSuccess ? parsedAnalysis : aiResponseText,
      parsed: parseSuccess
    });

  } catch (error) {
    console.error('[api/analyze.js] Error calling Google Gemini API or processing request:', error);

    let errorMessage = 'Failed to analyze code due to an internal server error.';
    if (error.response && error.response.statusText) {
      errorMessage = `Google AI Error: ${error.response.statusText}. Please check your API key, usage limits, or the content of your request.`;
    } else if (error.message && error.message.includes("API key")) {
        errorMessage = "Google AI API key is missing or invalid.";
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ error: errorMessage });
  }
}
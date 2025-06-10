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

    // --- MODIFIED PROMPT: Emphasize JSON and no extra text ---
    const prompt = `You are an expert AI programming assistant specializing in web development.
Analyze the following code snippet. Identify potential bugs, suggest improvements for clarity, efficiency, and adherence to best practices, and explain any complex or non-obvious parts.
If the code is HTML, CSS, or JavaScript, prioritize web-specific issues like accessibility, performance, and cross-browser compatibility where applicable.

Your response MUST be a single, valid JSON object. Do NOT include any other text, markdown, or conversational elements outside the JSON.
The JSON object MUST have the following structure:
{
  "bugs": [
    { "message": "Short description of bug and its cause.", "line": "Line number or N/A", "severity": "high/medium/low" }
  ],
  "improvements": [
    { "message": "Description of improvement and why it's useful.", "line": "Line number or N/A", "severity": "medium/low" }
  ],
  "explanations": [
    { "message": "Explanation of concept.", "line": "Line number or N/A", "severity": "info" }
  ]
}

If no items fit a category, provide an empty array for that category (e.g., "bugs": []).
Example for line numbers: "line": "15" or "line": "N/A" for general issues.
All messages should be concise and actionable.

Code to analyze:
\`\`\`
${userCode}
\`\`\``;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let aiResponseText = response.text(); // Get the plain text content from the AI's response

    // --- NEW: Robust JSON Extraction ---
    // Use a regex to find the first JSON object enclosed in curly braces
    // This handles cases where the AI might include ```json ... ``` or other wrapper text.
    const jsonMatch = aiResponseText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
        // If it was wrapped in ```json ```, use the content inside
        aiResponseText = jsonMatch[1];
    } else {
        // Fallback: if not wrapped, try to find a standalone JSON object
        // This is less robust, but covers cases where it just outputs { ... }
        const rawJsonMatch = aiResponseText.match(/(\{[\s\S]*?\})/);
        if (rawJsonMatch && rawJsonMatch[1]) {
            aiResponseText = rawJsonMatch[1];
        }
    }

    let parsedAnalysis = {};
    let parseSuccess = false;
    try {
        parsedAnalysis = JSON.parse(aiResponseText);
        // Basic validation for the expected structure
        if (parsedAnalysis.bugs && Array.isArray(parsedAnalysis.bugs) &&
            parsedAnalysis.improvements && Array.isArray(parsedAnalysis.improvements) &&
            parsedAnalysis.explanations && Array.isArray(parsedAnalysis.explanations)) {
            parseSuccess = true;
        } else {
            console.warn("AI returned JSON but not with the expected top-level keys. Falling back to raw text.");
        }
    } catch (parseError) {
        console.error("Failed to parse AI response as JSON:", parseError);
        console.error("Raw AI response leading to parse error:", aiResponseText);
        // parseSuccess remains false
    }

    // --- Send the results back to the frontend ---
    res.status(200).json({
      analysis: parseSuccess ? parsedAnalysis : aiResponseText, // Send structured or raw
      parsed: parseSuccess // Indicate if parsing was successful
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
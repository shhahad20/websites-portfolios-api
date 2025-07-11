import { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import { supabase } from "../config/supabaseClient.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CV_SYSTEM_PROMPT } from "../config/prompts.js";

dotenv.config();

const apiKey = process.env.GOOGLE_API_KEY ?? ""; // Provide a fallback
const genAI = new GoogleGenerativeAI(apiKey);

export const aiChat = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { messages, cv_id } = req.body;

    // Validate request
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "No messages provided" });
    }

    const lastMessage = messages[messages.length - 1];

    if (!lastMessage.content) {
      return res.status(400).json({ error: "No message content provided" });
    }

    // Fetch CV data - either specific CV or latest
    let query = supabase
      .from("cv_uploads")
      .select("extracted_text, original_name, id");

    if (cv_id) {
      query = query.eq("id", cv_id);
    } else {
      query = query.order("id", { ascending: false }).limit(1);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching CV data:", error);
      return res
        .status(500)
        .json({ error: "Error fetching CV data from database" });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({
        error: "No CV data found. Please upload a CV first.",
      });
    }

    const cvData = data[0];
    const cvContent = cvData.extracted_text;
    const fileName = cvData.original_name;

    if (!cvContent) {
      return res.status(400).json({
        error:
          "No CV content found. Please ensure your CV text was extracted correctly.",
      });
    }

    // Build conversation history for context
    const conversationHistory = messages
      .slice(0, -1)
      .map(
        (msg: any) =>
          `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
      )
      .join("\n");

    // Construct the comprehensive prompt
    const prompt = `${CV_SYSTEM_PROMPT}

CV FILE: ${fileName}

CV CONTENT:
${cvContent}

${conversationHistory ? `CONVERSATION HISTORY:\n${conversationHistory}\n` : ""}

CURRENT USER QUESTION: ${lastMessage.content}

Please provide a helpful and accurate response based on the CV content above.`;

    // Generate AI response
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      },
    });

    const response = await model.generateContent(prompt);
    const reply = response.response.text();

    // Return response with metadata
    res.json({
      reply,
      cv_info: {
        file_name: fileName,
        cv_id: cvData.id,
      },
    });
  } catch (error) {
    console.error("Error in aiChat:", error);

    // More specific error handling
    if (error instanceof Error) {
      if (error.message.includes("API")) {
        return res
          .status(503)
          .json({
            error: "AI service temporarily unavailable. Please try again.",
          });
      }
      if (error.message.includes("quota")) {
        return res
          .status(429)
          .json({ error: "API quota exceeded. Please try again later." });
      }
    }

    res.status(500).json({ error: "Error generating AI response" });
  }
};

// Optional: Helper function to validate CV content
export const validateCVContent = (content: string): boolean => {
  if (!content || content.trim().length < 50) {
    return false;
  }

  // Basic CV indicators
  const cvIndicators = [
    "experience",
    "education",
    "skills",
    "work",
    "employment",
    "qualification",
    "degree",
    "university",
    "college",
    "company",
    "job",
    "position",
    "role",
    "responsibility",
    "achievement",
  ];

  const lowerContent = content.toLowerCase();
  return cvIndicators.some((indicator) => lowerContent.includes(indicator));
};

// Optional: Helper function to extract key CV sections
export const extractCVSections = (content: string) => {
  const sections = {
    contact: null,
    summary: null,
    experience: null,
    education: null,
    skills: null,
    other: null,
  };

  // This is a basic implementation - you might want to use more sophisticated parsing
  const lowerContent = content.toLowerCase();

  // Look for section headers
  const sectionHeaders = {
    contact: ["contact", "personal", "details"],
    summary: ["summary", "profile", "objective", "about"],
    experience: ["experience", "work", "employment", "career"],
    education: ["education", "academic", "qualification"],
    skills: ["skills", "competencies", "abilities"],
  };

  // Basic section detection logic would go here
  // This is a placeholder for more sophisticated parsing

  return sections;
};

export const portfolioChatWithPath = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { messages } = req.body;
    const clientName = req.params.clientName; // From route: /api/portfolio/:clientName/chat

    // Validate messages
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "No messages provided" });
    }
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.content) {
      return res.status(400).json({ error: "No message content provided" });
    }
    if (!clientName) {
      return res.status(400).json({ error: "Client identifier required" });
    }

    // Get client data by slug
    const { data: clientData, error } = await supabase
      .from("profiles")
      .select(
        `
        id, 
        name, 
        active_cv_id (
          id, 
          extracted_text, 
          original_name, 
          created_at
        )
      `
      )
      .eq("name", clientName)
      .single();

    if (error || !clientData) {
      return res.status(404).json({
        error: "Portfolio not found.",
      });
    }

    // Get active CV for this client
    const activeCVs = clientData.active_cv_id;

    if (activeCVs.length === 0) {
      return res.status(404).json({
        error: "No active CV found for this portfolio.",
      });
    }

    // Use the most recent active CV
    const activeCV = activeCVs.sort(
      (a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    const cvContent = activeCV.extracted_text;
    const fileName = activeCV.original_name;

    if (!cvContent) {
      return res.status(400).json({
        error: "CV content not available. Please try again later.",
      });
    }

    // Build conversation history
    const conversationHistory = messages
      .slice(0, -1)
      .map(
        (msg: any) =>
          `${msg.role === "user" ? "Visitor" : "Assistant"}: ${msg.content}`
      )
      .join("\n");

    // Client-specific system prompt
    const CLIENT_PORTFOLIO_PROMPT = `You are an AI assistant for ${clientData.name}'s professional portfolio. You help visitors learn about ${clientData.name}'s skills, experience, and qualifications based on their CV/resume.

INSTRUCTIONS:
1. Always refer to ${clientData.name} by name when appropriate
2. Be professional, friendly, and helpful to potential employers or collaborators
3. Highlight key achievements and skills relevant to the visitor's questions
4. If information isn't in the CV, politely state it's not available
5. Encourage visitors to contact ${clientData.name} for more information
6. Be enthusiastic about ${clientData.name}'s qualifications while remaining factual

TONE: Professional, welcoming, and informative - representing ${clientData.name} in the best light

REMEMBER: You're helping visitors understand why they should hire or collaborate with ${clientData.name}.`;

    const prompt = `${CLIENT_PORTFOLIO_PROMPT}

${clientData.name.toUpperCase()}'S CV:
${cvContent}

${conversationHistory ? `CONVERSATION HISTORY:\n${conversationHistory}\n` : ""}

VISITOR'S QUESTION: ${lastMessage.content}

Please provide a helpful response about ${clientData.name} based on their CV.`;

    // Generate AI response
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      },
    });

    const response = await model.generateContent(prompt);
    const reply = response.response.text();

    res.json({
      reply,
      client_info: {
        name: clientData.name,
        cv_file: fileName,
        last_updated: activeCV.created_at,
      },
    });
  } catch (error) {
    console.error("Error in portfolioChatWithPath:", error);
    res.status(500).json({ error: "Error generating AI response" });
  }
};

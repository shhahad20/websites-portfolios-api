import { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import { adminSupabase, supabase } from "../config/supabaseClient.js";
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
    const clientSlug = req.params.clientName;

    // 1) Validate inputs
    if (!messages?.length) {
      return res.status(400).json({ error: "No messages provided" });
    }
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.content) {
      return res.status(400).json({ error: "No message content provided" });
    }
    if (!clientSlug) {
      return res.status(400).json({ error: "Client identifier required" });
    }

    // 2) Load profile by slug (case-insensitive) - removed .single()
    console.log("Looking for client slug:", clientSlug);
    
    const {
      data: clientDataArray,
      error: profileError,
    } = await adminSupabase
      .from("profiles")
      .select("id, name, active_cv_id")
      .ilike("name", clientSlug);

    if (profileError) {
      console.error("Supabase profile error:", profileError);
      return res.status(500).json({ error: "Database error" });
    }
    
    console.log("Found profiles:", clientDataArray);
    
    // Check if any profiles were found
    if (!clientDataArray || clientDataArray.length === 0) {
      // Let's try a broader search to see what's actually in the database
      const { data: allProfiles } = await adminSupabase
        .from("profiles")
        .select("id, name")
        .limit(10);
      
      console.log("Available profiles in database:", allProfiles);
      
      return res.status(404).json({ 
        error: "Portfolio not found.",
        debug: {
          searchedFor: clientSlug,
          availableProfiles: allProfiles?.map(p => p.name) || []
        }
      });
    }

    // Handle multiple matches (optional: you might want to be more specific)
    if (clientDataArray.length > 1) {
      console.warn(`Multiple profiles found for slug: ${clientSlug}`);
    }

    // Use the first match
    const clientData = clientDataArray[0];

    // 3) Fetch the CV row (by ID if set, otherwise latest)
    let cvQuery = adminSupabase
      .from("cv_uploads")
      .select("id, extracted_text, original_name, created_at");

    if (clientData.active_cv_id) {
      cvQuery = cvQuery.eq("id", clientData.active_cv_id);
    } else {
      // Add a filter to only get CVs for this specific profile/user
      // Assuming cv_uploads has a user_id or profile_id column
      cvQuery = cvQuery
        .eq("user_id", clientData.id) // Adjust column name as needed
        .order("created_at", { ascending: false })
        .limit(1);
    }

    const { data: cvRows, error: cvError } = await cvQuery;

    if (cvError) {
      console.error("Supabase CV fetch error:", cvError);
      return res
        .status(500)
        .json({ error: "Error fetching CV data from database" });
    }
    if (!cvRows?.length) {
      return res
        .status(404)
        .json({ error: "No CV data found. Please upload a CV first." });
    }

    const activeCV = cvRows[0];
    const { extracted_text: cvContent, original_name: fileName, created_at } =
      activeCV;

    if (!cvContent) {
      return res
        .status(400)
        .json({ error: "CV content not available. Please try again later." });
    }

    // 4) Build conversation history
    const conversationHistory = messages
      .slice(0, -1)
      .map((msg: any) =>
        msg.role === "user" ? `Visitor: ${msg.content}` : `Assistant: ${msg.content}`
      )
      .join("\n");

    // 5) System prompt
    const CLIENT_PORTFOLIO_PROMPT = `
You are an AI assistant for ${clientData.name}'s professional portfolio.
Use ONLY the information from their CV below to answer visitor questions.

${clientData.name.toUpperCase()}'S CV:
${cvContent}

${conversationHistory ? `CONVERSATION HISTORY:\n${conversationHistory}\n\n` : ""}
VISITOR'S QUESTION: ${lastMessage.content}

Please respond professionally, accurately, and in the tone of a friendly portfolio guide for ${clientData.name}.
    `.trim();

    // 6) Generate
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      },
    });
    const aiResp = await model.generateContent(CLIENT_PORTFOLIO_PROMPT);
    const reply = aiResp.response.text();

    // 7) Return
    return res.json({
      reply,
      client_info: {
        name: clientData.name,
        cv_file: fileName,
        last_updated: created_at,
      },
    });
  } catch (err) {
    console.error("Error in portfolioChatWithPath:", err);
    return res.status(500).json({ error: "Error generating AI response" });
  }
};

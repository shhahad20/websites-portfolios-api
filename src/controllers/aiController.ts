import { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import { supabase } from "../config/supabaseClient.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
// import { systemPrompt } from "../config/systemPrompt.js";
dotenv.config();

const apiKey = process.env.GOOGLE_API_KEY ?? ""; // Provide a fallback
const genAI = new GoogleGenerativeAI(apiKey);

export const aiChat = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Fetch prompts and extracted text from the cv_uploads table
    const { data, error } = await supabase
      .from("cv_uploads")
      .select("prompts, extracted_text, file_name")
      .order("id", { ascending: false });

    if (error) {
      console.error("Error fetching data from cv_uploads:", error);
      return res.status(500).json({ error: "Error fetching data from database" });
    }

    if (!data || data.length === 0) {
      return res.status(400).json({ 
        error: "No CV data found. Please upload a CV first." 
      });
    }

    // Get the most recent CV data
    const latestCV = data[0];
    const systemPrompt = latestCV.prompts || "You are a helpful assistant that answers questions about CVs/resumes.";
    const cvContent = latestCV.extracted_text;

    if (!cvContent) {
      return res.status(400).json({ 
        error: "No CV content found. Please ensure your CV text was extracted correctly." 
      });
    }

    // Use the last user message as the question
    const { messages } = req.body;
    
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "No messages provided" });
    }

    const lastMessage = messages[messages.length - 1];
    
    // Construct the prompt with system prompt, CV content, and user question
    const prompt = `${systemPrompt}

CV Content:
${cvContent}

User Question: ${lastMessage.content}

Please answer the user's question based on the CV content provided above.`;

    // Call generateContent with the constructed prompt
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const response = await model.generateContent(prompt);
    const reply = response.response.text();
    
    res.json({ reply });
  } catch (error) {
    console.error("Error in aiChat:", error);
    res.status(500).json({ error: "Error fetching AI response" });
  }
};

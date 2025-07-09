
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
    // Fetch prompts from the cv_uploads table
    const { data, error } = await supabase
      .from("cv_uploads")
      .select("prompts")
      .order("id", { ascending: false });

    if (error) {
      console.error("Error fetching prompts from cv_uploads:", error);
      return res.status(500).json({ error: "Error fetching prompts from database" });
    }

    // Collect all prompts into a single string (if multiple rows)
    const promptsArray = (data || []).map((row: any) => row.prompts).filter(Boolean);
    const promptsText = promptsArray.join("\n");

    // Use the last user message as the question
    const { messages } = req.body;
    const lastMessage = messages[messages.length - 1];
    const prompt = `${promptsText}\nUser: ${lastMessage.content}`;

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

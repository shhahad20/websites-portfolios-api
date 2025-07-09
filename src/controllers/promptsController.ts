import multer from "multer";
import pdf2md from "@opendocsg/pdf2md";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabaseClient.js";
import { AuthenticatedRequest } from "../middleware/authMiddleware.js";

// emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ensure /uploads exists
const uploadsDir = resolve(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// multer storage into local uploads folder
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * Clean and enhance markdown from pdf2md output
 */
const enhanceMarkdown = (markdown: string): string => {
  // Clean up the markdown
  let enhanced = markdown
    // Remove excessive newlines
    .replace(/\n{3,}/g, "\n\n")
    // Fix bullet points
    .replace(/^[\s]*[•·▪▫▸▹‣⁃]\s*/gm, "- ")
    // Fix numbered lists
    .replace(/^[\s]*(\d+)[\.\)]\s*/gm, "$1. ")
    // Clean up headers - remove extra spaces
    .replace(/^#+\s+/gm, (match) => match.replace(/\s+/g, " "))
    // Fix contact information formatting
    .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, "**$1**")
    .replace(/(\+\d{1,3}[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,9})/g, "**$1**")
    // Fix dates in headers
    .replace(/(\d{4}[\s\-–]+\d{4})/g, "*$1*")
    .replace(/(\d{4}[\s\-–]+(present|current))/gi, "*$1*")
    // Clean up extra spaces
    .replace(/\s+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();

  // Post-process to improve structure
  const lines = enhanced.split("\n");
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i + 1]?.trim() || "";

    if (!line) continue;

    // Convert sections to proper headers if they're not already
    if (isSectionHeader(line) && !line.startsWith("#")) {
      processedLines.push(`## ${line.toUpperCase()}`);
      processedLines.push("");
      continue;
    }

    // Convert job titles/positions to subheaders
    if (isJobTitle(line, nextLine) && !line.startsWith("#")) {
      processedLines.push(`### ${line}`);
      processedLines.push("");
      continue;
    }

    // Add emphasis to company names
    if (isCompanyName(line, lines[i - 1]?.trim() || "")) {
      processedLines.push(`**${line}**`);
      processedLines.push("");
      continue;
    }

    processedLines.push(line);
  }

  return processedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/**
 * Check if a line is a section header
 */
function isSectionHeader(line: string): boolean {
  const sectionKeywords = [
    "career objective",
    "objective",
    "summary",
    "profile",
    "work experience",
    "experience",
    "employment",
    "professional experience",
    "education",
    "academic background",
    "qualifications",
    "skills",
    "technical skills",
    "core competencies",
    "expertise",
    "projects",
    "key projects",
    "selected projects",
    "certifications",
    "certificates",
    "professional development",
    "achievements",
    "accomplishments",
    "awards",
    "languages",
    "language skills",
    "personal skills",
    "references",
    "contact",
    "personal information",
  ];

  const lowerLine = line.toLowerCase().trim();

  return (
    sectionKeywords.some(
      (keyword) =>
        lowerLine === keyword ||
        (lowerLine.includes(keyword) && line.length < 50)
    ) ||
    // All caps short lines are likely headers
    (line === line.toUpperCase() &&
      line.length > 2 &&
      line.length < 50 &&
      !line.includes("@") &&
      !line.includes("+") &&
      !hasDatePattern(line))
  );
}

/**
 * Check if a line is a job title
 */
function isJobTitle(line: string, nextLine: string): boolean {
  const jobTitlePatterns = [
    /\b(manager|director|engineer|developer|analyst|consultant|coordinator|specialist|assistant|lead|senior|junior)\b/i,
    /\b(ceo|cto|cfo|vp|vice president|president|head|chief)\b/i,
    /\b(intern|trainee|associate|executive|officer|administrator)\b/i,
    /\b(designer|architect|programmer|technician|supervisor)\b/i,
    /\b(ambassador|representative|advisor|consultant|instructor|teacher)\b/i,
  ];

  return (
    (jobTitlePatterns.some((pattern) => pattern.test(line)) &&
      (hasDatePattern(line) || hasDatePattern(nextLine))) ||
    (hasDatePattern(line) && line.length < 100 && line.length > 10)
  );
}

/**
 * Check if a line is a company name
 */
function isCompanyName(line: string, previousLine: string): boolean {
  const companyPatterns = [
    /\b(inc|llc|corp|company|ltd|limited|co\.)\b/i,
    /\b(university|college|school|institute|academy)\b/i,
    /\b(ministry|government|department|agency)\b/i,
    /\b(group|organization|foundation|firm)\b/i,
  ];

  return (
    companyPatterns.some((pattern) => pattern.test(line)) ||
    (isJobTitle(previousLine, "") &&
      !hasDatePattern(line) &&
      line.length < 80 &&
      line.length > 5)
  );
}

/**
 * Check if a line has date pattern
 */
function hasDatePattern(line: string): boolean {
  const datePatterns = [
    /\b\d{4}\s*[-–]\s*\d{4}\b/,
    /\b\d{4}\s*[-–]\s*(present|current)\b/i,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}/i,
    /\b\d{1,2}\/\d{4}\s*[-–]\s*\d{1,2}\/\d{4}\b/,
    /\b(20\d{2})\s*[-–]\s*(20\d{2}|present|current)\b/i,
  ];

  return datePatterns.some((pattern) => pattern.test(line));
}

/**
 * Generate intelligent prompts based on CV content
 */
function generateIntelligentPrompts(markdown: string): string[] {
  const prompts: string[] = [];
  const content = markdown.toLowerCase();
  const sections = extractSections(markdown);

  // Basic prompts
  prompts.push("Summarize my CV in 3-4 sentences");
  prompts.push("What are my contact details?");

  // Experience-based prompts
  if (sections.experience) {
    prompts.push("What is my work experience?");
    prompts.push("What are my most recent job responsibilities?");
    prompts.push("What companies have I worked for?");

    if (
      content.includes("senior") ||
      content.includes("lead") ||
      content.includes("manager")
    ) {
      prompts.push("What leadership experience do I have?");
    }

    if (content.includes("remote") || content.includes("freelance")) {
      prompts.push("What remote work experience do I have?");
    }
  }

  // Skills-based prompts
  if (sections.skills) {
    prompts.push("What are my technical skills?");

    if (
      content.includes("javascript") ||
      content.includes("react") ||
      content.includes("node")
    ) {
      prompts.push("What JavaScript and web development skills do I have?");
    }

    if (
      content.includes("python") ||
      content.includes("data") ||
      content.includes("sql")
    ) {
      prompts.push("What programming and data analysis skills do I have?");
    }

    if (
      content.includes("design") ||
      content.includes("adobe") ||
      content.includes("ui/ux")
    ) {
      prompts.push("What design skills do I have?");
    }
  }

  // Education prompts
  if (sections.education) {
    prompts.push("What is my educational background?");

    if (
      content.includes("computer science") ||
      content.includes("software engineering")
    ) {
      prompts.push("What is my technical education?");
    }

    if (content.includes("bootcamp") || content.includes("certification")) {
      prompts.push("What additional training and certifications do I have?");
    }
  }

  // Project prompts
  if (sections.projects) {
    prompts.push("What projects have I worked on?");
    prompts.push("Can you describe my key projects in detail?");

    if (content.includes("e-commerce") || content.includes("full-stack")) {
      prompts.push("What full-stack development projects have I completed?");
    }
  }

  // Specific technology prompts
  if (content.includes("react") && content.includes("node")) {
    prompts.push("What full-stack JavaScript experience do I have?");
  }

  if (content.includes("mongodb") || content.includes("database")) {
    prompts.push("What database experience do I have?");
  }

  // Soft skills and teamwork
  if (
    content.includes("team") ||
    content.includes("collaboration") ||
    content.includes("scrum")
  ) {
    prompts.push("What teamwork and collaboration skills do I have?");
  }

  // Language skills
  if (
    content.includes("language") ||
    content.includes("arabic") ||
    content.includes("english")
  ) {
    prompts.push("What languages do I speak?");
  }

  // Location and availability
  if (content.includes("saudi") || content.includes("riyadh")) {
    prompts.push("What is my location and work availability?");
  }

  return prompts.slice(0, 15); // Limit to 15 prompts
}

/**
 * Extract sections from markdown
 */
function extractSections(markdown: string): Record<string, boolean> {
  const sections: Record<string, boolean> = {};
  const lines = markdown.split("\n");

  for (const line of lines) {
    if (line.startsWith("## ") || line.startsWith("# ")) {
      const sectionName = line.replace(/^#+\s*/, "").toLowerCase();

      if (
        sectionName.includes("experience") ||
        sectionName.includes("work") ||
        sectionName.includes("employment")
      ) {
        sections.experience = true;
      } else if (
        sectionName.includes("skill") ||
        sectionName.includes("competenc") ||
        sectionName.includes("expertise")
      ) {
        sections.skills = true;
      } else if (
        sectionName.includes("education") ||
        sectionName.includes("academic") ||
        sectionName.includes("qualification")
      ) {
        sections.education = true;
      } else if (
        sectionName.includes("certification") ||
        sectionName.includes("certificate") ||
        sectionName.includes("course")
      ) {
        sections.certifications = true;
      } else if (sectionName.includes("project")) {
        sections.projects = true;
      } else if (
        sectionName.includes("achievement") ||
        sectionName.includes("award")
      ) {
        sections.achievements = true;
      } else if (sectionName.includes("language")) {
        sections.languages = true;
      }
    }
  }

  return sections;
}

/**
 * 1️⃣ Upload the PDF, insert a row with status='uploaded', return the uploadId.
 *    POST /cv/upload
 */
export const uploadCv = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (req.file.mimetype !== "application/pdf") {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    const { data, error } = await supabase
      .from("cv_uploads")
      .insert({
        user_id: req.user?.id,
        original_name: req.file.originalname,
        stored_path: req.file.path,
        mimetype: req.file.mimetype,
        status: "uploaded",
      })
      .select("id")
      .single();

    if (error) throw error;

    res
      .status(201)
      .json({ uploadId: data.id, message: "PDF uploaded successfully" });
  } catch (err: any) {
    next(err);
  }
};

/**
 * 2️⃣ Read the file, parse it using pdf2md, enhance the markdown, generate prompts, update the row.
 *    POST /cv/:uploadId/prompts
 */
/**
 * Collapse runs of single-letter tokens into proper words.
 */
function collapsePhantomLines(input: string): string {
  const lines = input.split(/\r?\n/);
  const outLines: string[] = [];

  for (let line of lines) {
    // split on any whitespace
    const tokens = line.trim().split(/\s+/);
    if (tokens.length > 0) {
      // count how many are single A–Z letters
      const letterTokens = tokens.filter(
        (t) => t.length === 1 && /^[A-Za-z]$/.test(t)
      ).length;
      if (letterTokens / tokens.length > 0.6) {
        // collapse ALL tokens into one “word”
        outLines.push(tokens.join(""));
        continue;
      }
    }
    // otherwise just collapse any multi‑spaces internally
    outLines.push(line.replace(/\s+/g, " ").trim());
  }

  return outLines.join("\n");
}

export const generatePrompts = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { uploadId } = req.params;
  try {
    // 1) Fetch the record & verify ownership + status
    let { data: rows, error: fetchError } = await supabase
      .from("cv_uploads")
      .select("stored_path, status")
      .eq("id", uploadId)
      .eq("user_id", req.user?.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!rows) return res.status(404).json({ error: "Upload not found" });

    // Allow reprocessing if force=true is passed as query parameter
    const allowReprocess = req.query.force === "true";

    if (rows.status !== "uploaded" && !allowReprocess) {
      return res.status(400).json({
        error: `Cannot re-process a '${rows.status}' upload. Add ?force=true to reprocess anyway.`,
      });
    }

    // If forcing reprocess, reset the status
    if (allowReprocess && rows.status !== "uploaded") {
      const { error: resetError } = await supabase
        .from("cv_uploads")
        .update({
          status: "uploaded",
          error_msg: null,
          processed_at: null,
        })
        .eq("id", uploadId);
      if (resetError) throw resetError;
      console.log("Reset upload status to allow reprocessing");
    }

    console.log("Processing file:", rows.stored_path);

    // 2) Check if file exists
    if (!fs.existsSync(rows.stored_path)) {
      throw new Error(`File not found: ${rows.stored_path}`);
    }

    // right before: const rawMarkdown = await pdf2md(rows.stored_path);
    const stats = fs.statSync(rows.stored_path);
    console.log("🛠 File exists, size:", stats.size);

    // 3) Read the file yourself, then pass the Buffer to pdf2md
    const fileBuffer = fs.readFileSync(rows.stored_path);
    console.log("Buffer length:", fileBuffer.byteLength);

    const rawMarkdown = await pdf2md(fileBuffer);

    if (!rawMarkdown || rawMarkdown.trim().length === 0) {
      throw new Error("No content could be extracted from the PDF");
    }
    function collapseLetterGaps(s: string): string {
      let prev: string;
      do {
        prev = s;
        // ([A-Za-z0-9])  capture a letter or digit
        // \s+            one or more whitespace (spaces/newlines/tabs)
        // ([A-Za-z0-9])  capture the next letter or digit
        // replace with $1$2 (glue them together)
        s = s.replace(/([A-Za-z0-9])\s+([A-Za-z0-9])/g, "$1$2");
      } while (s !== prev);
      return s;
    }
    // const preprocessed = collapsePhantomLines(rawMarkdown);
    const preprocessed = collapseLetterGaps(rawMarkdown);
    // (Optional) Remove spaces before punctuation, e.g. "Word , Next" → "Word, Next"
    const cleaned = preprocessed.replace(/\s+([,.;:!?])/g, "$1");

    // 4) Now feed into your existing pipeline:
    // Log lengths so you can verify it actually shrank:
    console.log("RAW length:", rawMarkdown.length);
    console.log("PREPROCESSED length:", preprocessed.length);

    // 4) Now feed it through your existing pipeline
    const enhancedMarkdown = enhanceMarkdown(cleaned);
    const prompts = generateIntelligentPrompts(enhancedMarkdown);
    // 6) Create a summary from the markdown (first 500 chars)
    const summary =
      enhancedMarkdown.substring(0, 500) +
      (enhancedMarkdown.length > 500 ? "..." : "");

    // 7) Clean up the uploaded file (only if processing was successful)
    fs.unlinkSync(rows.stored_path);

    // 8) Update Supabase row
    const { error: updateError } = await supabase
      .from("cv_uploads")
      .update({
        status: "processed",
        extracted_text: enhancedMarkdown, // Store full enhanced markdown
        prompts,
        processed_at: new Date().toISOString(),
      })
      .eq("id", uploadId);

    if (updateError) throw updateError;

    // 9) Return response
    res.json({
      extractedText: summary, // Send summary to frontend
      markdownContent: enhancedMarkdown, // Send full enhanced markdown
      examplePrompts: prompts,
    });
  } catch (err: any) {
    console.error("Error in generatePrompts:", err);

    // On any failure, mark row as error
    await supabase
      .from("cv_uploads")
      .update({
        status: "error",
        error_msg: err.message,
        processed_at: new Date().toISOString(),
      })
      .eq("id", uploadId);

    next(err);
  }
};

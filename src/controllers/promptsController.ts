import multer from "multer";
import PDFParser from "pdf2json";
import fs from "fs";
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabaseClient.js";
import { AuthenticatedRequest } from "../middleware/authMiddleware.js";

// emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ensure /uploads exists
const uploadsDir = resolve(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// multer storage into local uploads folder
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename:   (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * Convert PDF text to structured Markdown format
 */
function convertToMarkdown(pdfText: string): string {
  const lines = pdfText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  let markdown = '';
  let currentSection = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';
    
    // Detect sections based on common CV keywords
    if (isHeading(line)) {
      currentSection = line.toLowerCase();
      markdown += `\n## ${line}\n\n`;
    }
    // Detect contact info (usually at top)
    else if (isContactInfo(line)) {
      if (!markdown.includes('## Contact Information')) {
        markdown += `## Contact Information\n\n`;
      }
      markdown += `- ${line}\n`;
    }
    // Detect dates (for experience/education)
    else if (hasDatePattern(line)) {
      markdown += `\n### ${line}\n`;
    }
    // Detect bullet points or skills
    else if (isBulletPoint(line)) {
      markdown += `- ${line.replace(/^[-•*]\s*/, '')}\n`;
    }
    // Regular text
    else {
      // If it looks like a job title or position
      if (isJobTitle(line, nextLine)) {
        markdown += `\n**${line}**\n`;
      } else {
        markdown += `${line}\n`;
      }
    }
  }
  
  return markdown.trim();
}

function isHeading(line: string): boolean {
  const headingKeywords = [
    'experience', 'education', 'skills', 'summary', 'objective',
    'work experience', 'employment', 'career', 'background',
    'qualifications', 'certifications', 'achievements', 'projects',
    'contact', 'personal', 'profile', 'about', 'languages',
    'references', 'awards', 'publications', 'training'
  ];
  
  const lowerLine = line.toLowerCase();
  return headingKeywords.some(keyword => 
    lowerLine.includes(keyword) && 
    line.length < 50 && 
    !line.includes('@') && 
    !line.includes('.')
  );
}

function isContactInfo(line: string): boolean {
  const contactPatterns = [
    /@/,                                    // Email
    /\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/, // Phone
    /linkedin\.com|github\.com|twitter\.com/, // Social media
    /^[A-Za-z\s,]+\d{5}$/,                 // Address with zip
    /\b\d{5}\b/                            // Zip code
  ];
  
  return contactPatterns.some(pattern => pattern.test(line));
}

function hasDatePattern(line: string): boolean {
  const datePatterns = [
    /\b\d{4}\s*[-–]\s*\d{4}\b/,           // 2020 - 2023
    /\b\d{4}\s*[-–]\s*present\b/i,        // 2020 - Present
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}/i, // Jan 2020
    /\b\d{1,2}\/\d{4}\s*[-–]\s*\d{1,2}\/\d{4}\b/ // 01/2020 - 12/2023
  ];
  
  return datePatterns.some(pattern => pattern.test(line));
}

function isBulletPoint(line: string): boolean {
  return /^[-•*]\s/.test(line) || 
         /^[A-Z][a-z]+:/.test(line) ||  // "Skills:", "Languages:"
         (line.includes('•') || line.includes('▪') || line.includes('‣'));
}

function isJobTitle(line: string, nextLine: string): boolean {
  // Check if current line looks like a job title and next line has company/date info
  const jobTitlePatterns = [
    /\b(manager|director|engineer|developer|analyst|consultant|coordinator|specialist|assistant|lead|senior|junior)\b/i,
    /\b(ceo|cto|cfo|vp|vice president)\b/i
  ];
  
  const companyPatterns = [
    /\b(inc|llc|corp|company|ltd|limited)\b/i,
    /\b(university|college|school)\b/i
  ];
  
  return jobTitlePatterns.some(pattern => pattern.test(line)) ||
         (line.length < 80 && companyPatterns.some(pattern => pattern.test(nextLine)));
}

/**
 * Generate intelligent prompts based on Markdown structure
 */
function generateIntelligentPrompts(markdown: string): string[] {
  const prompts: string[] = [];
  const sections = extractSections(markdown);
  
  // Basic prompts that work for any CV
  prompts.push("Summarize my CV in 3-4 sentences");
  prompts.push("What are my contact details?");
  
  // Experience-based prompts
  if (sections.experience) {
    prompts.push("What is my work experience?");
    prompts.push("What are my most recent job responsibilities?");
    prompts.push("How many years of experience do I have?");
    prompts.push("What companies have I worked for?");
  }
  
  // Skills-based prompts
  if (sections.skills) {
    prompts.push("What are my technical skills?");
    prompts.push("What programming languages do I know?");
    prompts.push("What are my core competencies?");
  }
  
  // Education-based prompts
  if (sections.education) {
    prompts.push("What is my educational background?");
    prompts.push("What degrees do I have?");
    prompts.push("Where did I study?");
  }
  
  // Certification-based prompts
  if (sections.certifications) {
    prompts.push("What certifications do I have?");
    prompts.push("What professional qualifications do I hold?");
  }
  
  // Project-based prompts
  if (sections.projects) {
    prompts.push("What projects have I worked on?");
    prompts.push("Can you describe my project experience?");
  }
  
  // Achievement-based prompts
  if (sections.achievements || sections.awards) {
    prompts.push("What are my key achievements?");
    prompts.push("What awards or recognitions have I received?");
  }
  
  // Language prompts
  if (sections.languages) {
    prompts.push("What languages do I speak?");
  }
  
  // Dynamic prompts based on content
  if (markdown.includes('leadership') || markdown.includes('team')) {
    prompts.push("What leadership experience do I have?");
  }
  
  if (markdown.includes('startup') || markdown.includes('entrepreneur')) {
    prompts.push("What startup or entrepreneurial experience do I have?");
  }
  
  return prompts;
}

function extractSections(markdown: string): Record<string, boolean> {
  const sections: Record<string, boolean> = {};
  const lines = markdown.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const sectionName = line.substring(3).toLowerCase();
      if (sectionName.includes('experience') || sectionName.includes('work')) {
        sections.experience = true;
      } else if (sectionName.includes('skill')) {
        sections.skills = true;
      } else if (sectionName.includes('education')) {
        sections.education = true;
      } else if (sectionName.includes('certification') || sectionName.includes('qualification')) {
        sections.certifications = true;
      } else if (sectionName.includes('project')) {
        sections.projects = true;
      } else if (sectionName.includes('achievement') || sectionName.includes('award')) {
        sections.achievements = true;
      } else if (sectionName.includes('language')) {
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
export const uploadCv = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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

    res.status(201).json({ uploadId: data.id, message: "PDF uploaded successfully" });
  } catch (err: any) {
    next(err);
  }
};

/**
 * 2️⃣ Read the file, parse it, convert to Markdown, generate intelligent prompts, update the row.
 *    POST /cv/:uploadId/prompts
 */
export const generatePrompts = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
    if (rows.status !== "uploaded") {
      return res.status(400).json({ error: `Cannot re-process a '${rows.status}' upload` });
    }

    console.log('Processing file:', rows.stored_path);
    
    // 2) Check if file exists
    if (!fs.existsSync(rows.stored_path)) {
      throw new Error(`File not found: ${rows.stored_path}`);
    }

    // 3) Read and parse PDF using pdf2json
    const dataBuffer = fs.readFileSync(rows.stored_path);
    const pdfText: string = await new Promise((resolve, reject) => {
      const pdfParser = new PDFParser();
      pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
      pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
        // Extract text from all pages
        const text = pdfData.formImage.Pages.map((page: any) =>
          page.Texts.map((textObj: any) =>
            decodeURIComponent(textObj.R.map((r: any) => r.T).join("")
          )
        ).join(" ")
        ).join("\n");
        resolve(text);
      });
      pdfParser.parseBuffer(dataBuffer);
    });
    // 4) Convert to Markdown
    const markdownContent = convertToMarkdown(pdfText);
    console.log('Generated Markdown:', markdownContent.substring(0, 200) + '...');
    
    // 5) Generate intelligent prompts
    const prompts = generateIntelligentPrompts(markdownContent);
    
    // 6) Create a summary from the markdown (first 500 chars)
    const summary = markdownContent.substring(0, 500) + (markdownContent.length > 500 ? '...' : '');
    
    // 7) Clean up the uploaded file
    fs.unlinkSync(rows.stored_path);

    // 8) Update Supabase row
    const { error: updateError } = await supabase
      .from("cv_uploads")
      .update({
        status: "processed",
        extracted_text: markdownContent, // Store full markdown
        prompts,
        processed_at: new Date().toISOString(),
      })
      .eq("id", uploadId);

    if (updateError) throw updateError;

    // 9) Return response
    res.json({ 
      extractedText: summary, // Send summary to frontend
      markdownContent: markdownContent, // Send full markdown
      examplePrompts: prompts 
    });
  } catch (err: any) {
    console.error('Error in generatePrompts:', err);
    
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
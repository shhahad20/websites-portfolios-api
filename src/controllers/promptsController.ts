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

export const convertPdfToMd = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  if (req.file.mimetype !== "application/pdf") {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Only PDF files are allowed" });
  }
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const markdown = await pdf2md(fileBuffer);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(markdown);
  } catch (error) {
    console.error("Error converting PDF:", error);
    res.status(500).json({ error: "Failed to convert PDF" });
  }
};

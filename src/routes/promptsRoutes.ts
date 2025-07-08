import { Router } from "express";
import { upload, uploadCv, generatePrompts } from "../controllers/promptsController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

// Route for uploading PDF and generating prompts
// Step 1: upload PDF + insert row
router.post("/cv/upload", authenticate, upload.single("file"), uploadCv);

// Step 2: generate prompts on demand
router.post("/cv/:uploadId/prompts", authenticate, generatePrompts);

export default router;

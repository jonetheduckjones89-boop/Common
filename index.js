import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// ===== CONFIG =====
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
  res.send("Documents AI Backend Running Successfully 👍");
});

// ===== PROCESS DOCUMENT =====
app.post("/process", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) return res.status(400).json({ error: "File is required" });

    // Upload to Supabase Storage
    const filePath = `uploads/${Date.now()}-${file.originalname}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // Generate public URL
    const { data: publicURL } = supabase.storage
      .from("documents")
      .getPublicUrl(filePath);

    // AI — read & extract text
    const extract = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content:
            "You analyze any document (PDF, DOCX, images, invoices, receipts) and extract clean structured text."
        },
        { role: "user", content: `Extract useful text from this document: ${publicURL.publicUrl}` }
      ]
    });

    const extractedText = extract.choices[0].message.content;

    // AI — smart automation summary
    const summary = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content:
            "You create smart automation insights for business documents."
        },
        {
          role: "user",
          content: `Summarize this document in 5 bullet points and generate 3 automation ideas:\n\n${extractedText}`
        }
      ]
    });

    const automation = summary.choices[0].message.content;

    return res.json({
      status: "success",
      extractedText,
      automation,
      fileURL: publicURL.publicUrl,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err.message });
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));

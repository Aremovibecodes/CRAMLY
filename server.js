const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

app.get('/test', (req, res) => {
  res.send('Server is alive!');
});

app.post('/generate', async (req, res) => {
  const { notes, difficulty, imageData, imageMimeType } = req.body;

  const wordCount = (notes || '').trim().split(/\s+/).filter(Boolean).length;
  const targetQuestions = Math.min(15, Math.max(5, Math.round(wordCount / 15) || 5));
  const isHard = difficulty === 'hard';

  const quizFormatInstructions = isHard
    ? "QUIZ: Generate exactly " + targetQuestions + " open-ended written questions requiring a typed answer, no multiple choice. For each, include a modelAnswer field with the ideal correct answer. Structure: { \"question\": \"text\", \"modelAnswer\": \"text\" }."
    : "QUIZ: Generate exactly " + targetQuestions + " multiple-choice questions, each with exactly 4 options. Structure: { \"question\": \"text\", \"options\": [\"A\",\"B\",\"C\",\"D\"], \"correctIndex\": 0 }.";

  const imageInstruction = imageData
    ? "The student has attached a photo of their handwritten or messy notes. Read the image content carefully first, then combine it with any typed notes below as the full source material.\n\n"
    : "";

  const prompt = "You are a study assistant helping a student cram for an exam.\n" +
    "Question difficulty level: " + difficulty + ". Adjust complexity: easy = recall-based, medium = application-based, hard = exam-level tricky reasoning.\n\n" +
    imageInstruction +
    "Respond with ONLY valid JSON, no markdown, no code fences, no extra text. Use exactly this structure:\n\n" +
    "{\n  \"explanation\": \"...\",\n  \"quiz\": [ ... ],\n  \"cramSheet\": \"...\"\n}\n\n" +
    "EXPLANATION: Rewrite the notes as a clear, structured, plain-language walkthrough, teaching it from scratch.\n\n" +
    quizFormatInstructions + "\n\n" +
    "CRAM SHEET: Must be DIFFERENT from the explanation, not a shorter copy. List Must-Know points ranked by importance, highest-yield first. Tight numbered points, not full sentences.\n\n" +
    "No markdown symbols, no em dashes.\n\nNotes:\n" + (notes || "(see attached image)");

  const parts = [{ text: prompt }];
  if (imageData && imageMimeType) {
    parts.push({ inline_data: { mime_type: imageMimeType, data: imageData } });
  }

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({ contents: [{ parts: parts }] })
      }
    );
    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(rawText);
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something broke - check the terminal.' });
  }
});

app.post('/grade', async (req, res) => {
  const { answers } = req.body;

  let gradingPrompt = "You are grading a student's written exam answers. For each, compare the student's answer to the model answer, judging meaning and key concepts, not exact wording. Respond with ONLY valid JSON, no markdown: an array where each item is { \"correct\": true or false, \"feedback\": \"one short sentence\" }, in the same order given.\n\n";

  answers.forEach(function(a, i) {
    gradingPrompt += (i + 1) + ". Question: " + a.question + "\nModel answer: " + a.modelAnswer + "\nStudent answer: " + (a.studentAnswer || "(no answer given)") + "\n\n";
  });

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: gradingPrompt }] }] })
      }
    );
    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const results = JSON.parse(rawText);
    res.json({ results: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Grading failed - check the terminal.' });
  }
});

app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

app.get('/test', (req, res) => {
  res.send('Server is alive!');
});

app.post('/generate', async (req, res) => {
  const { notes, difficulty, imageData, imageMimeType } = req.body;

  if ((!notes || notes.trim() === '') && !imageData) {
    return res.status(400).json({ error: 'No notes or image provided.' });
  }

  const wordCount = (notes || '').trim().split(/\s+/).filter(Boolean).length;
  const targetQuestions = Math.min(15, Math.max(5, Math.round(wordCount / 15) || 5));
  const isHard = difficulty === 'hard';

  const quizFormatInstructions = isHard
    ? "QUIZ: Generate exactly " + targetQuestions + " open-ended written questions requiring a typed answer, no multiple choice. For each, include a modelAnswer field with the ideal correct answer written in simple, plain words. Structure: { \"question\": \"text\", \"modelAnswer\": \"text\" }."
    : "QUIZ: Generate exactly " + targetQuestions + " multiple-choice questions, each with exactly 4 options and a short explanation of why the correct answer is right, written in simple plain words. Structure: { \"question\": \"text\", \"options\": [\"A\",\"B\",\"C\",\"D\"], \"correctIndex\": 0, \"explanation\": \"text\" }.";

  const imageInstruction = imageData
    ? "The student has attached a photo of handwritten or messy notes. Read it carefully first, then combine it with any typed notes below.\n\n"
    : "";

  const prompt = "You are a friendly study assistant helping a student cram for an exam. Many students using this are slow learners, so use very simple, everyday words, short sentences, and avoid jargon. If a technical term is necessary, explain it in plain words right after using it.\n\n" +
    "Question difficulty level: " + difficulty + ". Adjust complexity: easy = recall-based, medium = application-based, hard = exam-level tricky reasoning, but ALWAYS keep the wording simple regardless of difficulty.\n\n" +
    imageInstruction +
    "Respond with ONLY valid JSON, no markdown, no code fences, no extra text. Use exactly this structure:\n\n" +
    "{\n  \"explanation\": [ { \"heading\": \"short section title\", \"content\": \"plain language explanation\" } ],\n  \"quiz\": [ ... ],\n  \"cramSheet\": [ \"point 1\", \"point 2\" ]\n}\n\n" +
    "EXPLANATION: Break the material into 2 to 5 short sections, each with its own clear heading, teaching it from scratch like a patient tutor.\n\n" +
    quizFormatInstructions + "\n\n" +
    "CRAM SHEET: An array of short, tight bullet points, ranked by importance, highest-yield first. Must be different from the explanation, not a shorter copy of it.\n\n" +
    "No markdown symbols, no em dashes, no asterisks, no hash symbols anywhere.\n\nNotes:\n" + (notes || "(see attached image)");

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

    if (!response.ok) {
      console.error('Gemini API error status:', response.status);
      return res.status(502).json({ error: 'The AI service did not respond correctly. Please try again.' });
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      console.error('Unexpected Gemini response:', JSON.stringify(data));
      return res.status(502).json({ error: 'The AI did not return a usable response. Please try again.' });
    }

    let rawText = data.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('JSON parse failed. Raw text was:', rawText);
      return res.status(502).json({ error: 'The AI response was not in the right format. Please try again.' });
    }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something broke on our end. Check your connection and try again.' });
  }
});

app.post('/grade', async (req, res) => {
  const { answers } = req.body;

  if (!answers || answers.length === 0) {
    return res.status(400).json({ error: 'No answers to grade.' });
  }

  let gradingPrompt = "You are grading a student's written exam answers. Many students are slow learners, so write feedback in very simple, everyday words, short sentences, no jargon. Compare the student's answer to the model answer, judging meaning not exact wording. Respond with ONLY valid JSON, no markdown: an array where each item is { \"correct\": true or false, \"feedback\": \"one short simple sentence\" }, in the same order given.\n\n";

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

    if (!response.ok) {
      return res.status(502).json({ error: 'The AI grading service did not respond correctly.' });
    }

    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let results;
    try {
      results = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('Grading JSON parse failed. Raw text was:', rawText);
      return res.status(502).json({ error: 'Grading response was not in the right format.' });
    }

    res.json({ results: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Grading failed - check your connection and try again.' });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
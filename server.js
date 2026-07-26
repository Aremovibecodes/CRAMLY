const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(__dirname));
const PORT = 3000;

app.get('/test', (req, res) => {
  res.send('Server is alive!');
});
app.post('/generate', async (req, res) => {
  const { notes } = req.body;

  const prompt = `You are a study assistant helping a student cram for an exam.
Given these messy notes, produce three clearly labeled sections:

1. SIMPLIFIED EXPLANATION - explain the material in plain, easy language.
2. QUIZ - 5 short quiz questions with answers, to test understanding.
3. CRAM SHEET - a tight bullet-point summary for last-minute revision.

Notes:
${notes}`;
  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;
    res.json({ result: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something broke — check the terminal.' });
  }
});
app.listen(PORT, () => {
console.log(`Server running on http://localhost:${PORT}`);
});
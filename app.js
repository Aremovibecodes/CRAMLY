if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(function(err) {
    console.log("Service worker registration failed:", err);
  });
}
const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("cramlyTheme");

if (savedTheme === "dark") {
  document.body.classList.add("dark");
  themeToggle.textContent = "☀️ Light Mode";
}

themeToggle.addEventListener("click", function() {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  themeToggle.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
  localStorage.setItem("cramlyTheme", isDark ? "dark" : "light");
});

const button = document.getElementById("generateBtn");
const imageInput = document.getElementById("imageInput");

function fileToBase64(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() {
      resolve(reader.result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

button.addEventListener("click", async function() {
  const notes = document.getElementById("notesInput").value.trim();
  const difficulty = document.getElementById("difficulty").value;
  const output = document.getElementById("output");
  const imageFile = imageInput.files[0];

  if (notes === "" && !imageFile) {
    output.innerHTML = "<p style='color:red;'>Please paste some notes or attach a photo before starting.</p>";
    return;
  }

  output.innerHTML = "Thinking...";

  try {
    let imageData = null;
    let imageMimeType = null;

    if (imageFile) {
      imageData = await fileToBase64(imageFile);
      imageMimeType = imageFile.type;
    }

    const response = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: notes,
        difficulty: difficulty,
        imageData: imageData,
        imageMimeType: imageMimeType
      })
    });
    const data = await response.json();
    renderResults(data);
  } catch (err) {
    output.innerText = "Connection hiccup - check your internet and try again.";
  }
});

function renderResults(data) {
  const output = document.getElementById("output");
  output.innerHTML = "";

  const explanationSection = document.createElement("div");
  explanationSection.innerHTML = "<h2>Explanation</h2><p>" + data.explanation + "</p>";
  output.appendChild(explanationSection);

  const quizDiv = document.createElement("div");
  quizDiv.innerHTML = "<h2>Quiz</h2>";

  const isWritten = data.quiz.length > 0 && !data.quiz[0].options;
  const questionBlocks = [];

  data.quiz.forEach(function(q, index) {
    const block = document.createElement("div");
    block.className = "question-block";

    if (isWritten) {
      block.innerHTML = "<p><strong>" + (index + 1) + ". " + q.question + "</strong></p>" +
        "<textarea class='answerInput' rows='3' placeholder='Type your answer here...'></textarea>";
    } else {
      let optionsHTML = "";
      q.options.forEach(function(option, optIndex) {
        optionsHTML += "<label><input type='radio' name='q" + index + "' value='" + optIndex + "'> " + option + "</label><br>";
      });
      block.innerHTML = "<p><strong>" + (index + 1) + ". " + q.question + "</strong></p>" + optionsHTML;
    }

    quizDiv.appendChild(block);
    questionBlocks.push(block);
  });

  const submitBtn = document.createElement("button");
  submitBtn.innerText = "Submit Quiz";
  quizDiv.appendChild(submitBtn);

  const scoreDiv = document.createElement("div");
  scoreDiv.id = "scoreDiv";
  quizDiv.appendChild(scoreDiv);

  if (isWritten) {
    submitBtn.addEventListener("click", async function() {
      submitBtn.disabled = true;
      submitBtn.innerText = "Grading...";

      const answers = data.quiz.map(function(q, index) {
        const textarea = questionBlocks[index].querySelector(".answerInput");
        return { question: q.question, modelAnswer: q.modelAnswer, studentAnswer: textarea.value.trim() };
      });

      try {
        const response = await fetch('/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: answers })
        });
        const gradeData = await response.json();
        const results = gradeData.results;
        let score = 0;

        results.forEach(function(result, index) {
          if (result.correct) score++;
          const block = questionBlocks[index];
          block.querySelector(".answerInput").disabled = true;

          const feedback = document.createElement("p");
          feedback.innerHTML = (result.correct ? "✅ " : "❌ ") + result.feedback;
          feedback.className = result.correct ? "correct-answer" : "wrong-answer";
          block.appendChild(feedback);
        });

        scoreDiv.innerHTML = "<p><strong>You scored " + score + " out of " + results.length + "</strong></p>";
        submitBtn.style.display = "none";
      } catch (err) {
        scoreDiv.innerHTML = "<p style='color:red;'>Grading failed. Check your connection and try again.</p>";
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Quiz";
      }
    });
  } else {
    submitBtn.addEventListener("click", function() {
      let score = 0;
      data.quiz.forEach(function(q, index) {
        const block = questionBlocks[index];
        const selected = document.querySelector("input[name='q" + index + "']:checked");
        const selectedValue = selected ? parseInt(selected.value) : null;
        if (selectedValue === q.correctIndex) score++;

        const labels = block.querySelectorAll("label");
        labels.forEach(function(label, optIndex) {
          const input = label.querySelector("input");
          if (optIndex === q.correctIndex) {
            label.innerHTML = "✅ " + label.innerHTML;
            label.classList.add("correct-answer");
          } else if (optIndex === selectedValue) {
            label.innerHTML = "❌ " + label.innerHTML;
            label.classList.add("wrong-answer");
          }
          input.disabled = true;
        });
      });
      scoreDiv.innerHTML = "<p><strong>You scored " + score + " out of " + data.quiz.length + "</strong></p>";
    });
  }

  output.appendChild(quizDiv);
  const cramSection = document.createElement("div");
  cramSection.innerHTML = "<h2>Cram Sheet</h2><p>" + data.cramSheet + "</p>";
  output.appendChild(cramSection);
}
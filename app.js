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
    output.innerHTML = "<p class='error-message'>Please paste some notes or attach a photo before starting.</p>";
    return;
  }

  if (imageFile && imageFile.size > 5 * 1024 * 1024) {
    output.innerHTML = "<p class='error-message'>That image is a bit too large. Please use a photo under 5MB.</p>";
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
      body: JSON.stringify({ notes: notes, difficulty: difficulty, imageData: imageData, imageMimeType: imageMimeType })
    });

    const data = await response.json();

    if (!response.ok) {
      output.innerHTML = "<p class='error-message'>" + (data.error || "Something went wrong.") + "</p>";
      return;
    }

    renderResults(data);
  } catch (err) {
    output.innerHTML = "<p class='error-message'>Connection hiccup. Check your internet and try again.</p>";
  }
});

function renderResults(data) {
  const output = document.getElementById("output");
  output.innerHTML = "";

  const explanationSection = document.createElement("div");
  let explanationHTML = "<h2>Explanation</h2>";
  data.explanation.forEach(function(section) {
    explanationHTML += "<h3>" + section.heading + "</h3><p>" + section.content + "</p>";
  });
  explanationSection.innerHTML = explanationHTML;
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
      const oldWarnings = quizDiv.querySelectorAll(".missing-warning");
      oldWarnings.forEach(function(w) { w.remove(); });

      let firstUnanswered = null;
      questionBlocks.forEach(function(block) {
        const textarea = block.querySelector(".answerInput");
        if (textarea.value.trim() === "") {
          const warning = document.createElement("p");
          warning.className = "missing-warning";
          warning.innerText = "⚠️ Can't leave this blank";
          block.appendChild(warning);
          if (!firstUnanswered) firstUnanswered = block;
        }
      });

      if (firstUnanswered) {
        firstUnanswered.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

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

        if (!response.ok) {
          scoreDiv.innerHTML = "<p class='error-message'>" + (gradeData.error || "Grading failed.") + "</p>";
          submitBtn.disabled = false;
          submitBtn.innerText = "Submit Quiz";
          return;
        }

        const results = gradeData.results;
        let score = 0;

        results.forEach(function(result, index) {
          if (result.correct) score++;
          const block = questionBlocks[index];
          const textarea = block.querySelector(".answerInput");
          const studentAnswer = textarea.value.trim() || "(no answer given)";
          textarea.disabled = true;

          const review = document.createElement("div");
          review.className = "review-box";
          review.innerHTML =
            "<p><strong>Your answer:</strong> " + studentAnswer + "</p>" +
            "<p><strong>Model answer:</strong> " + data.quiz[index].modelAnswer + "</p>" +
            "<p class='" + (result.correct ? "correct-answer" : "wrong-answer") + "'>" +
            (result.correct ? "✅ Correct. " : "❌ Not quite. ") + result.feedback + "</p>";
          block.appendChild(review);
        });

        scoreDiv.innerHTML = "<p><strong>You scored " + score + " out of " + results.length + "</strong></p>";
        submitBtn.style.display = "none";
      } catch (err) {
        scoreDiv.innerHTML = "<p class='error-message'>Grading failed. Check your connection and try again.</p>";
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Quiz";
      }
    });
  } else {
    submitBtn.addEventListener("click", function() {
      const oldWarnings = quizDiv.querySelectorAll(".missing-warning");
      oldWarnings.forEach(function(w) { w.remove(); });

      let firstUnanswered = null;
      data.quiz.forEach(function(q, index) {
        const selected = document.querySelector("input[name='q" + index + "']:checked");
        if (!selected) {
          const block = questionBlocks[index];
          const warning = document.createElement("p");
          warning.className = "missing-warning";
          warning.innerText = "⚠️ You missed this";
          block.appendChild(warning);
          if (!firstUnanswered) firstUnanswered = block;
        }
      });

      if (firstUnanswered) {
        firstUnanswered.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      let score = 0;
      data.quiz.forEach(function(q, index) {
        const block = questionBlocks[index];
        const selected = document.querySelector("input[name='q" + index + "']:checked");
        const selectedValue = selected ? parseInt(selected.value) : null;
        const selectedText = selectedValue !== null ? q.options[selectedValue] : "(no answer selected)";
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

        const review = document.createElement("div");
        review.className = "review-box";
        review.innerHTML =
          "<p><strong>Your answer:</strong> " + selectedText + "</p>" +
          "<p><strong>Correct answer:</strong> " + q.options[q.correctIndex] + "</p>" +
          "<p>" + q.explanation + "</p>";
        block.appendChild(review);
      });
      scoreDiv.innerHTML = "<p><strong>You scored " + score + " out of " + data.quiz.length + "</strong></p>";
    });
  }

  output.appendChild(quizDiv);

  const cramSection = document.createElement("div");
  let cramHTML = "<h2>Cram Sheet</h2><ol class='cram-list'>";
  data.cramSheet.forEach(function(point) {
    cramHTML += "<li>" + point + "</li>";
  });
  cramHTML += "</ol>";
  cramSection.innerHTML = cramHTML;
  output.appendChild(cramSection);
}
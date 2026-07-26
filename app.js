const button = document.getElementById("generateBtn");

button.addEventListener("click", async function() {
  const notes = document.getElementById("notesInput").value;
  const output = document.getElementById("output");

  output.innerText = "Thinking...";

  try {
    const response = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes })
    });
    const data = await response.json();
    output.innerText = data.result;
  } catch (err) {
    output.innerText = "Something went wrong — check the terminal.";
  }
});
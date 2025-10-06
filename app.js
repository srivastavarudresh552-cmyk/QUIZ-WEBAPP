// High-level state
const state = {
  userName: "",
  questions: [], // {id, question, options[], answerIndex}
  order: [], // randomized order of indices
  currentIndex: 0, // index in order
  selectedAnswers: {}, // key: questionId -> selected option index (number)
  markedForReview: new Set(), // questionId set
  correctness: {}, // questionId -> boolean (true correct, false incorrect)
  timerSeconds: 15 * 60, // 15 minutes default; 
  timerId: null,
  warningsCount: 0, // tab switch warnings
  quizEnded: false
};

// Elements
const loginView = document.getElementById("loginView");
const quizView = document.getElementById("quizView");
const resultsView = document.getElementById("resultsView");
const userDisplay = document.getElementById("userDisplay");
const loginForm = document.getElementById("loginForm");
const nameInput = document.getElementById("nameInput");
const timerDisplay = document.getElementById("timerDisplay");
const endTestBtn = document.getElementById("endTestBtn");
const questionIndexEl = document.getElementById("questionIndex");
const markReviewBtn = document.getElementById("markReviewBtn");
const questionTextEl = document.getElementById("questionText");
const optionsList = document.getElementById("optionsList");
const feedbackEl = document.getElementById("feedback");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const attemptedCountEl = document.getElementById("attemptedCount");
const unattemptedCountEl = document.getElementById("unattemptedCount");
const reviewCountEl = document.getElementById("reviewCount");
const progressBar = document.getElementById("progressBar");
const finalScoreEl = document.getElementById("finalScore");
const sumCorrectEl = document.getElementById("sumCorrect");
const sumIncorrectEl = document.getElementById("sumIncorrect");
const sumAttemptedEl = document.getElementById("sumAttempted");
const sumUnattemptedEl = document.getElementById("sumUnattempted");
const reAttemptBtn = document.getElementById("reAttemptBtn");
const themeToggle = document.getElementById("themeToggle");
const modal = document.getElementById("modal");
const modalDesc = document.getElementById("modalDesc");
const modalOkBtn = document.getElementById("modalOkBtn");

// Theme
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}
themeToggle.addEventListener("click", toggleTheme);
const savedTheme = localStorage.getItem("theme");
applyTheme(savedTheme || "dark");

// Login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  state.userName = name;
  userDisplay.textContent = `User: ${name}`;
  loginView.classList.add("hidden");
  quizView.classList.remove("hidden");
  await initQuiz();
});

// Fetch questions
async function fetchQuestions() {
  const res = await fetch("./questions.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load questions.json");
  const data = await res.json();
  if (!Array.isArray(data) || data.length < 10)
    throw new Error("Need at least 10 questions");
  return data;
}

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function initQuiz() {
  // reset state
  state.questions = await fetchQuestions();
  state.order = shuffle(state.questions.map((_, idx) => idx));
  state.currentIndex = 0;
  state.selectedAnswers = {};
  state.markedForReview = new Set();
  state.correctness = {};
  state.quizEnded = false;
  state.warningsCount = 0;
  // 10 minutes for demo
  state.timerSeconds = 10 * 60;

  buildProgressBar();
  renderCurrentQuestion();
  updateStatusBar();
  startTimer();
}

// Rendering
function renderCurrentQuestion() {
  const qIdx = state.order[state.currentIndex];
  const q = state.questions[qIdx];
  questionIndexEl.textContent = `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  questionTextEl.textContent = q.question;

  optionsList.innerHTML = "";
  optionsList.setAttribute("aria-labelledby", "questionText");

  q.options.forEach((opt, idx) => {
    const label = document.createElement("label");
    label.className = "option";
    label.setAttribute("role", "radio");
    label.setAttribute("tabindex", "0");
    label.setAttribute("aria-checked", "false");
    label.setAttribute("aria-label", `Option ${idx + 1}: ${opt}`);

    const input = document.createElement("input");
    input.type = "radio";
    input.name = `q_${q.id}`;
    input.value = String(idx);
    input.setAttribute("tabindex", "-1");

    label.appendChild(input);
    label.appendChild(document.createTextNode(opt));

    label.addEventListener("click", () => selectAnswer(q.id, idx));
    label.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectAnswer(q.id, idx);
      }
    });

    if (state.selectedAnswers[q.id] === idx) {
      label.classList.add("selected");
      input.checked = true;
      label.setAttribute("aria-checked", "true");
    }

    optionsList.appendChild(label);
  });

  const isMarked = state.markedForReview.has(q.id);
  markReviewBtn.textContent = isMarked ? "Unmark Review" : "Mark for Review";
  markReviewBtn.setAttribute("aria-pressed", String(isMarked));

  // Feedback (immediate)
  const sel = state.selectedAnswers[q.id];
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";
  if (sel !== undefined) {
    const isCorrect = sel === q.answerIndex;
    feedbackEl.textContent = isCorrect ? "Correct!" : "Incorrect";
    feedbackEl.classList.add(isCorrect ? "correct" : "incorrect");
    // decorate options
    [...optionsList.children].forEach((node, idx) => {
      if (idx === q.answerIndex) {
        node.classList.add("correct");
      }
      if (sel === idx && sel !== q.answerIndex) {
        node.classList.add("incorrect");
      }
    });
  }

  updateProgressBarCurrent();
}

function updateStatusBar() {
  const total = state.questions.length;
  let attempted = 0;
  Object.keys(state.selectedAnswers).forEach((qid) => {
    if (state.selectedAnswers[qid] !== undefined) attempted++;
  });
  const unattempted = total - attempted;
  const review = state.markedForReview.size;

  attemptedCountEl.textContent = String(attempted);
  unattemptedCountEl.textContent = String(unattempted);
  reviewCountEl.textContent = String(review);

  // update progress items classes
  const totalChildren = progressBar.children.length;
  for (let i = 0; i < totalChildren; i++) {
    const btn = progressBar.children[i];
    const qIdx = state.order[i];
    const q = state.questions[qIdx];
    btn.classList.remove("attempted", "unattempted", "review");
    if (state.markedForReview.has(q.id)) {
      btn.classList.add("review");
    }
    if (state.selectedAnswers[q.id] !== undefined) {
      btn.classList.add("attempted");
    } else {
      btn.classList.add("unattempted");
    }
  }
}

function buildProgressBar() {
  progressBar.innerHTML = "";
  const total = state.questions.length;
  for (let i = 0; i < total; i++) {
    const btn = document.createElement("button");
    btn.className = "progress-item unattempted";
    btn.setAttribute("aria-label", `Go to question ${i + 1}`);
    btn.setAttribute("tabindex", "0");
    btn.textContent = String(i + 1);
    btn.addEventListener("click", () => {
      state.currentIndex = i;
      renderCurrentQuestion();
      updateStatusBar();
    });
    progressBar.appendChild(btn);
  }
}

function updateProgressBarCurrent() {
  const total = progressBar.children.length;
  for (let i = 0; i < total; i++) {
    const btn = progressBar.children[i];
    btn.classList.toggle("current", i === state.currentIndex);
  }
}

// Selection and review
function selectAnswer(questionId, optionIndex) {
  if (state.quizEnded) return;
  state.selectedAnswers[questionId] = optionIndex;
  // compute correctness for immediate feedback
  const q = state.questions.find((q) => q.id === questionId);
  state.correctness[questionId] = optionIndex === q.answerIndex;
  renderCurrentQuestion();
  updateStatusBar();
}

markReviewBtn.addEventListener("click", () => {
  const qIdx = state.order[state.currentIndex];
  const q = state.questions[qIdx];
  if (state.markedForReview.has(q.id)) {
    state.markedForReview.delete(q.id);
  } else {
    state.markedForReview.add(q.id);
  }
  renderCurrentQuestion();
  updateStatusBar();
});

prevBtn.addEventListener("click", () => {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    renderCurrentQuestion();
  }
});
nextBtn.addEventListener("click", () => {
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex++;
    renderCurrentQuestion();
  }
});

// Timer
function startTimer() {
  clearInterval(state.timerId);
  updateTimerDisplay();
  state.timerId = setInterval(() => {
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerId);
      endQuiz();
      return;
    }
    state.timerSeconds -= 1;
    updateTimerDisplay();
  }, 1000);
}
function updateTimerDisplay() {
  const m = Math.floor(state.timerSeconds / 60);
  const s = state.timerSeconds % 60;
  timerDisplay.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(
    2,
    "0"
  )}`;
}

endTestBtn.addEventListener("click", () => {
  endQuiz();
});

// End and results
function calculateResults() {
  let correct = 0;
  let incorrect = 0;
  let attempted = 0;
  for (const q of state.questions) {
    const sel = state.selectedAnswers[q.id];
    if (sel === undefined) {
      continue;
    }
    attempted++;
    if (sel === q.answerIndex) correct++;
    else incorrect++;
  }
  const unattempted = state.questions.length - attempted;
  const score = correct * 4 + incorrect * -1 + 0 * unattempted;
  return { correct, incorrect, attempted, unattempted, score };
}

function showResults() {
  const { correct, incorrect, attempted, unattempted, score } =
    calculateResults();
  finalScoreEl.textContent = String(score);
  sumCorrectEl.textContent = String(correct);
  sumIncorrectEl.textContent = String(incorrect);
  sumAttemptedEl.textContent = String(attempted);
  sumUnattemptedEl.textContent = String(unattempted);

  // Save to leaderboard
  const entry = { name: state.userName, score, ts: Date.now() };
  const list = JSON.parse(localStorage.getItem("leaderboard") || "[]");
  list.unshift(entry);
  localStorage.setItem("leaderboard", JSON.stringify(list.slice(0, 10)));
  renderLeaderboard();

  quizView.classList.add("hidden");
  resultsView.classList.remove("hidden");
}

function renderLeaderboard() {
  const list = JSON.parse(localStorage.getItem("leaderboard") || "[]");
  const top3 = list
    .sort((a, b) => b.score - a.score || a.ts - b.ts)
    .slice(0, 3);
  const ol = document.getElementById("leaderboardList");
  ol.innerHTML = "";
  top3.forEach((item) => {
    const li = document.createElement("li");
    const dt = new Date(item.ts).toLocaleString();
    li.textContent = `${item.name} - ${item.score} (${dt})`;
    ol.appendChild(li);
  });
}

function endQuiz() {
  if (state.quizEnded) return;
  state.quizEnded = true;
  clearInterval(state.timerId);
  showResults();
}

reAttemptBtn.addEventListener("click", async () => {
  resultsView.classList.add("hidden");
  quizView.classList.remove("hidden");
  await initQuiz();
});

// Tab switch detection with warnings and auto-submit after three switches
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // when hidden, count
    state.warningsCount += 1;
    if (state.warningsCount <= 3) {
      showModal(
        `You left the tab. ${3 - state.warningsCount + 1} warning(s) left before auto submission.`
      );
    }
    if (state.warningsCount > 3) {
      endQuiz();
    }
  }
});

function showModal(message) {
  modalDesc.textContent = message;
  modal.classList.remove("hidden");
}
modalOkBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
});

// Keyboard navigation for next/prev
document.addEventListener("keydown", (e) => {
  if (state.quizEnded) return;
  if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    if (state.currentIndex < state.questions.length - 1) {
      state.currentIndex++;
      renderCurrentQuestion();
    }
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderCurrentQuestion();
    }
  }
});

// Expose for debugging
window.__quizState = state;


const meetUrlInput = document.getElementById('meetUrl');
const openMeetBtn = document.getElementById('openMeet');
const urlHelp = document.getElementById('urlHelp');

openMeetBtn.addEventListener('click', () => {
  const url = meetUrlInput.value.trim();
  if (!/^https:\/\/meet\.google\.com\/.+/.test(url)) {
    urlHelp.textContent = 'Please enter a valid Google Meet URL.';
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
  urlHelp.textContent = 'Meet launched! Keep this tab open as your companion dashboard.';
});

const reactions = ['🔥', '👏', '💡', '🚀', '😂', '🎉', '🤯', '✅'];
const reactionGrid = document.getElementById('reactionGrid');
const reactionFeed = document.getElementById('reactionFeed');

reactions.forEach((emoji) => {
  const btn = document.createElement('button');
  btn.textContent = emoji;
  btn.addEventListener('click', () => {
    reactionFeed.textContent = `Latest reaction: ${emoji} at ${new Date().toLocaleTimeString()}`;
  });
  reactionGrid.appendChild(btn);
});

const timerDisplay = document.getElementById('timerDisplay');
const startTimerBtn = document.getElementById('startTimer');
const pauseTimerBtn = document.getElementById('pauseTimer');
const resetTimerBtn = document.getElementById('resetTimer');

let timerSeconds = 10 * 60;
let timerId = null;

const renderTimer = () => {
  const minutes = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
  const seconds = String(timerSeconds % 60).padStart(2, '0');
  timerDisplay.textContent = `${minutes}:${seconds}`;
};

startTimerBtn.addEventListener('click', () => {
  if (timerId) return;
  timerId = setInterval(() => {
    timerSeconds -= 1;
    if (timerSeconds <= 0) {
      clearInterval(timerId);
      timerId = null;
      timerSeconds = 0;
      alert('Sprint complete! Time for a recap.');
    }
    renderTimer();
  }, 1000);
});

pauseTimerBtn.addEventListener('click', () => {
  clearInterval(timerId);
  timerId = null;
});

resetTimerBtn.addEventListener('click', () => {
  clearInterval(timerId);
  timerId = null;
  timerSeconds = 10 * 60;
  renderTimer();
});

const ideaInput = document.getElementById('ideaInput');
const addIdeaBtn = document.getElementById('addIdea');
const spinIdeaBtn = document.getElementById('spinIdea');
const ideaList = document.getElementById('ideaList');
const ideaResult = document.getElementById('ideaResult');

const ideas = [
  'One thing to celebrate from this week',
  'Fast brainstorm: 3 launch ideas',
  'What is blocking us right now?',
];

const renderIdeas = () => {
  ideaList.innerHTML = '';
  ideas.forEach((idea) => {
    const li = document.createElement('li');
    li.textContent = idea;
    ideaList.appendChild(li);
  });
};

addIdeaBtn.addEventListener('click', () => {
  const value = ideaInput.value.trim();
  if (!value) return;
  ideas.push(value);
  ideaInput.value = '';
  renderIdeas();
});

spinIdeaBtn.addEventListener('click', () => {
  const index = Math.floor(Math.random() * ideas.length);
  ideaResult.textContent = `🎯 Selected: ${ideas[index]}`;
});

const energy = document.getElementById('energy');
const energyValue = document.getElementById('energyValue');
energy.addEventListener('input', () => {
  energyValue.textContent = energy.value;
});

renderTimer();
renderIdeas();

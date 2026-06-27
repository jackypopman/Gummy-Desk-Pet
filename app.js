const STORAGE_KEY = "soft-pet-prototype-v1";

const defaults = {
  name: "团子",
  skin: "cat-orange",
  species: "cat",
  color: "cream",
  personality: "clingy",
  affection: 12,
  sound: true,
  bubbles: true,
  size: 100,
  position: 74,
  positionY: 72,
  focusMinutes: 25,
  lastLoyaltyDecayAt: Date.now(),
};

const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
const state = { ...defaults, ...saved };
const LOYALTY_DECAY_INTERVAL_MS = 5 * 60 * 1000;
if (!state.skin) state.skin = state.species === "dog" ? "dog-golden" : "cat-orange";
const nativeDesktop =
  new URLSearchParams(window.location.search).get("native") === "1" ||
  document.documentElement.dataset.nativeDesktop === "1";
if (nativeDesktop) document.body.classList.add("native-desktop");
let petMood = "idle";
let timerSeconds = state.focusMinutes * 60;
let timerId = null;
let dragState = null;
let bubbleTimer = null;
let idleTimer = null;
let actionTimer = null;
let motionTimer = null;
let blinkTimer = null;
let blinkResetTimer = null;
let loyaltyDecayTimer = null;
let activeMotionArt = 0;
const motionFrameCache = [];
let playIndex = 0;
let lastInteraction = Date.now();
let blinking = false;
let blinkFrameSrc = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  pet: $("#pet"),
  idleArt: $(".pet-idle-art"),
  motionArts: [$("#petMotionArtA"), $("#petMotionArtB")],
  petZone: $("#petZone"),
  bubble: $("#speechBubble"),
  particles: $("#heartParticles"),
  toast: $("#toast"),
  name: $("#profileName"),
  greetingName: $("#greetingName"),
  nameInput: $("#nameInput"),
  mood: $("#profileMood"),
  status: $("#statusCopy"),
  avatar: $("#miniAvatar"),
  affectionValue: $("#affectionValue"),
  affectionFill: $("#affectionFill"),
  compactAffection: $("#compactAffection"),
  quickPanel: $("#quickPanel"),
  closet: $("#closetDrawer"),
  settings: $("#settingsDrawer"),
  focusCard: $("#focusCard"),
  timer: $("#timer"),
  timerToggle: $("#timerToggle"),
  soundButton: $("#soundButton"),
};

const petSkins = [
  { id: "cat-orange", species: "cat", label: "橘猫铃铛", prefix: "cat-orange", icon: "🐱" },
  { id: "dog-golden", species: "dog", label: "金毛铃铛", prefix: "dog-golden", icon: "🐶" },
  { id: "cat-silver", species: "cat", label: "银灰围巾猫", prefix: "cat-silver", icon: "🐱" },
  { id: "dog-gray", species: "dog", label: "灰灰围巾狗", prefix: "dog-gray", icon: "🐶" },
  { id: "cat-white", species: "cat", label: "奶白蝴蝶结猫", prefix: "cat-white", icon: "🐱" },
  { id: "dog-white", species: "dog", label: "奶白围巾狗", prefix: "dog-white", icon: "🐶" },
  { id: "cat-black", species: "cat", label: "星星黑猫", prefix: "cat-black", icon: "🐈‍⬛" },
  { id: "dog-black", species: "dog", label: "星星黑柴", prefix: "dog-black", icon: "🐶" },
  { id: "cat-brown", species: "cat", label: "森林围巾猫", prefix: "cat-brown", icon: "🐱" },
  { id: "dog-brown", species: "dog", label: "森林长耳狗", prefix: "dog-brown", icon: "🐶" },
];

const skinById = Object.fromEntries(petSkins.map((skin) => [skin.id, skin]));

function currentSkin() {
  return skinById[state.skin] || petSkins[0];
}

const petAssets = Object.fromEntries(petSkins.map((skin) => [skin.id, {
  ...skin,
  idle: `./assets/animation-frames/${skin.prefix}-idle-1.png`,
  blinkFrames: [
    `./assets/animation-frames/${skin.prefix}-blink-half.png`,
    `./assets/animation-frames/${skin.prefix}-blink-closed.png`,
    `./assets/animation-frames/${skin.prefix}-blink-half.png`,
  ],
}]));

function currentPetAssets() {
  return petAssets[state.skin] || petAssets["cat-orange"];
}

function updateIdleArt() {
  if (!els.idleArt) return;
  const assets = currentPetAssets();
  const nextSrc = blinkFrameSrc || assets.idle;
  if (!els.idleArt.src.endsWith(nextSrc.replace("./", ""))) {
    els.idleArt.src = nextSrc;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function nativeMessage(type) {
  if (!nativeDesktop || !window.webkit?.messageHandlers?.petWindow) return;
  window.webkit.messageHandlers.petWindow.postMessage({ type });
}

function render() {
  const skin = currentSkin();
  state.species = skin.species;
  els.pet.className = `pet ${skin.species} ${state.skin} ${petMood}`;
  updateIdleArt();
  els.pet.style.left = `${state.position}%`;
  if (!nativeDesktop) els.pet.style.bottom = `${state.positionY}px`;
  els.pet.style.setProperty("--pet-scale", state.size / 100);
  els.pet.setAttribute("aria-label", `桌面宠物${state.name}`);
  els.name.textContent = state.name;
  els.greetingName.textContent = state.name;
  els.avatar.textContent = skin.icon;
  els.affectionValue.textContent = `${state.affection} / 100`;
  els.compactAffection.textContent = state.affection;
  els.affectionFill.style.width = `${state.affection}%`;
  els.soundButton.classList.toggle("off", !state.sound);
  $("#soundToggle").checked = state.sound;
  $("#bubbleToggle").checked = state.bubbles;
  $("#sizeRange").value = state.size;

  $$("#skinChoices button").forEach((button) => button.classList.toggle("selected", button.dataset.skin === state.skin));
  $$("#personalityChoices button").forEach((button) => button.classList.toggle("selected", button.dataset.personality === state.personality));
}

function setMood(mood, label, status) {
  petMood = mood;
  if (!motionSequences[mood]) stopMotionFrames();
  if (mood !== "idle") {
    blinking = false;
    blinkFrameSrc = "";
    clearTimeout(blinkResetTimer);
  }
  els.mood.textContent = `心情：${label}`;
  if (status) els.status.textContent = status;
  render();
}

function speak(message, duration = 1800) {
  if (!state.bubbles) return;
  clearTimeout(bubbleTimer);
  els.bubble.textContent = message;
  const zoneRect = els.petZone.getBoundingClientRect();
  const petRect = els.pet.getBoundingClientRect();
  els.bubble.style.left = `${petRect.left - zoneRect.left + petRect.width / 2 - 44}px`;
  els.bubble.style.bottom = `${zoneRect.bottom - petRect.top + 6}px`;
  els.bubble.classList.add("show");
  bubbleTimer = setTimeout(() => els.bubble.classList.remove("show"), duration);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 1900);
}

function addAffection(amount) {
  state.affection = Math.max(0, Math.min(100, state.affection + amount));
  saveState();
  render();
}

function applyLoyaltyDecay({ notify = false } = {}) {
  const now = Date.now();
  if (!state.lastLoyaltyDecayAt || state.lastLoyaltyDecayAt > now) {
    state.lastLoyaltyDecayAt = now;
    saveState();
    return;
  }

  const decaySteps = Math.floor((now - state.lastLoyaltyDecayAt) / LOYALTY_DECAY_INTERVAL_MS);
  if (decaySteps <= 0) return;

  state.lastLoyaltyDecayAt += decaySteps * LOYALTY_DECAY_INTERVAL_MS;
  const lost = Math.min(state.affection, decaySteps);
  if (lost > 0) {
    state.affection -= lost;
  }
  saveState();
  render();

  if (notify && lost > 0) {
    speak("有点想你了");
  }
}

function scheduleLoyaltyDecay() {
  clearInterval(loyaltyDecayTimer);
  loyaltyDecayTimer = setInterval(() => applyLoyaltyDecay({ notify: true }), 60 * 1000);
}

function hearts(count = 4) {
  const zoneRect = els.petZone.getBoundingClientRect();
  const petRect = els.pet.getBoundingClientRect();
  els.particles.style.left = `${petRect.left - zoneRect.left + petRect.width / 2}px`;
  els.particles.style.top = `${petRect.top - zoneRect.top + 35}px`;
  for (let i = 0; i < count; i += 1) {
    const heart = document.createElement("span");
    heart.className = "heart";
    heart.textContent = "♥";
    heart.style.left = `${(i - count / 2) * 17 + Math.random() * 10}px`;
    heart.style.top = `${Math.random() * 16}px`;
    heart.style.animationDelay = `${i * 70}ms`;
    els.particles.appendChild(heart);
    setTimeout(() => heart.remove(), 1200);
  }
}

function petInteraction() {
  lastInteraction = Date.now();
  clearTimeout(actionTimer);
  setMood("pet-petted", "开心", "刚刚被摸过，正舒服地微笑，尾巴轻轻摇着。");
  startMotionFrames("pet-petted");
  speak(state.species === "cat" ? "呼噜呼噜～" : "嘿嘿，再摸一下！");
  addAffection(1);
  actionTimer = setTimeout(
    () => settleToIdle("开心", "看起来精神很好，想和你的鼠标玩一会儿。"),
    1450,
  );
}

const playfulActions = [
  { mood: "rolling", label: "打滚", status: "突然躺倒翻了个身，露出肚皮打了个滚。", speech: "咕噜～", duration: 2650 },
  { mood: "yawning", label: "犯困", status: "张大嘴巴打了个哈欠，眼睛都快睁不开了。", speech: "啊呜……困困", duration: 2550 },
  { mood: "walking", label: "散步中", status: "迈着小步子，在桌边悠闲地遛弯。", speech: "出门遛一圈！", duration: 3200 },
  { mood: "scratching", label: "挠痒痒", status: "耳朵后面有点痒，正在认真挠一挠。", speech: "这里好痒呀～", duration: 2250 },
  { mood: "running", label: "兴奋", status: "突然来了精神，飞快地跑了一个来回。", speech: "追上我呀！", duration: 2250 },
];

const motionSequences = {
  "pet-petted": {
    name: "yawn",
    frames: [
      [1, 120], [2, 110], [3, 115], [6, 160], [7, 150], [6, 140], [3, 120], [8, 130], [1, 140],
    ],
  },
  rolling: {
    name: "roll",
    frames: [
      [1, 150], [2, 145], [3, 150], [4, 260], [5, 250], [6, 180], [7, 150], [8, 190], [1, 160],
    ],
  },
  scratching: {
    name: "scratch",
    frames: [
      [1, 150], [2, 120], [3, 120], [4, 110], [5, 105], [6, 110], [5, 105], [6, 110], [7, 135], [8, 180], [1, 150],
    ],
  },
  walking: {
    name: "walk",
    frames: [
      [1, 135], [3, 135], [5, 135], [7, 150], [5, 135], [3, 150],
      [1, 135], [3, 135], [5, 135], [7, 160], [5, 135], [3, 165],
    ],
  },
  running: {
    name: "run",
    frames: [
      [1, 100], [2, 92], [3, 92], [4, 105], [5, 92], [6, 92], [7, 110], [8, 125],
      [1, 95], [2, 88], [3, 92], [4, 105], [5, 92], [6, 95], [7, 120], [8, 140],
    ],
  },
  yawning: {
    name: "yawn",
    frames: [
      [1, 180], [2, 170], [3, 190], [4, 220], [5, 420], [6, 300], [7, 210], [8, 230], [1, 180],
    ],
  },
};

function preloadMotionFrames() {
  const sources = new Set();
  Object.values(petAssets).forEach((assets) => {
    sources.add(assets.idle);
    assets.blinkFrames.forEach((src) => sources.add(src));
  });
  Object.values(motionSequences).forEach((sequence) => {
    Object.values(petAssets).forEach((assets) => {
      for (let frame = 1; frame <= 8; frame += 1) {
        sources.add(`./assets/animation-frames/${assets.prefix}-${sequence.name}-${frame}.png`);
      }
    });
  });
  sources.forEach((src) => {
    const image = new Image();
    image.src = src;
    motionFrameCache.push(image);
  });
}

function stopMotionFrames() {
  clearTimeout(motionTimer);
  motionTimer = null;
  els.motionArts.forEach((art) => {
    art?.removeAttribute("data-frame");
    art?.classList.remove("active");
  });
  if (els.pet) els.pet.removeAttribute("data-motion-frame");
}

function startMotionFrames(mood) {
  const sequence = motionSequences[mood];
  if (!sequence || els.motionArts.some((art) => !art)) return;
  stopMotionFrames();
  blinking = false;
  blinkFrameSrc = "";
  clearTimeout(blinkResetTimer);
  updateIdleArt();
  let index = 0;
  const { prefix } = currentPetAssets();

  const next = () => {
    const [frame, hold] = sequence.frames[index % sequence.frames.length];
    const nextLayer = activeMotionArt === 0 ? 1 : 0;
    const active = els.motionArts[nextLayer];
    const inactive = els.motionArts[activeMotionArt];
    active.src = `./assets/animation-frames/${prefix}-${sequence.name}-${frame}.png`;
    active.dataset.frame = frame;
    els.pet.dataset.motionFrame = frame;
    active.classList.add("active");
    inactive.classList.remove("active");
    activeMotionArt = nextLayer;
    index += 1;
    motionTimer = setTimeout(next, hold);
  };

  next();
}

function settleToIdle(label = "开心", status = "活动完毕，又安静地待在你身边。") {
  clearTimeout(motionTimer);
  motionTimer = null;
  blinking = false;
  blinkFrameSrc = "";
  const { idle } = currentPetAssets();
  const nextLayer = activeMotionArt === 0 ? 1 : 0;
  const active = els.motionArts[nextLayer];
  const inactive = els.motionArts[activeMotionArt];
  if (!active || !inactive) {
    setMood("idle", label, status);
    return;
  }
  active.src = idle;
  active.removeAttribute("data-frame");
  active.classList.add("active");
  inactive.classList.remove("active");
  activeMotionArt = nextLayer;
  setTimeout(() => setMood("idle", label, status), 170);
}

function playAction(action = playfulActions[playIndex++ % playfulActions.length]) {
  if (timerId || dragState) return;
  clearTimeout(actionTimer);
  lastInteraction = Date.now();
  setMood(action.mood, action.label, action.status);
  startMotionFrames(action.mood);
  speak(action.speech, action.duration);
  actionTimer = setTimeout(() => settleToIdle(), action.duration);
}

function blinkOnce() {
  if (petMood !== "idle" || timerId || dragState || blinking) return;
  blinking = true;
  clearTimeout(blinkResetTimer);
  const frames = currentPetAssets().blinkFrames;
  const holds = [55, 85, 70, 0];
  let index = 0;
  const step = () => {
    if (petMood !== "idle" || timerId || dragState) {
      blinking = false;
      blinkFrameSrc = "";
      updateIdleArt();
      return;
    }
    blinkFrameSrc = frames[index] || "";
    updateIdleArt();
    index += 1;
    if (index <= frames.length) {
      blinkResetTimer = setTimeout(step, holds[index - 1]);
      return;
    }
    blinking = false;
    blinkFrameSrc = "";
    updateIdleArt();
  };
  step();
}

function scheduleBlinking() {
  clearInterval(blinkTimer);
  blinkTimer = setInterval(blinkOnce, 3000);
}

function positionQuickPanel() {
  const petRect = els.pet.getBoundingClientRect();
  const panelWidth = nativeDesktop ? 392 : (window.innerWidth <= 830 ? 330 : 374);
  const panelHeight = 204;
  const left = Math.max(16, Math.min(window.innerWidth - panelWidth - 16, petRect.right - panelWidth + 28));
  const top = Math.max(16, petRect.top - panelHeight - 16);
  els.quickPanel.style.left = `${left}px`;
  els.quickPanel.style.top = `${top}px`;
}

function openQuickPanel() {
  nativeMessage("panel");
  setTimeout(positionQuickPanel, nativeDesktop ? 180 : 0);
  els.quickPanel.classList.remove("hidden");
  speak("想和我做什么？");
}

function closeQuickPanel() {
  els.quickPanel.classList.add("hidden");
  if (els.closet.classList.contains("hidden") && els.settings.classList.contains("hidden") && els.focusCard.classList.contains("hidden")) {
    nativeMessage("compact");
  }
}

function feedTreat() {
  lastInteraction = Date.now();
  setMood("eating happy", "满足", "得到了一颗小零食，正在认真品尝。");
  speak(state.species === "cat" ? "是小鱼干！" : "香香的饼干！");
  addAffection(2);
  hearts(5);
  setTimeout(() => setMood("idle", "开心", "吃饱以后，它看起来更喜欢你了。"), 1500);
}

function toggleDrawer(drawer) {
  [els.closet, els.settings].forEach((item) => {
    if (item !== drawer) item.classList.add("hidden");
  });
  drawer.classList.toggle("hidden");
  nativeMessage(drawer.classList.contains("hidden") ? "compact" : "drawer");
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function updateTimer() {
  els.timer.textContent = formatTime(timerSeconds);
}

function stopTimer(completed = false) {
  clearInterval(timerId);
  timerId = null;
  els.timerToggle.textContent = "开始计时";
  if (completed) {
    setMood("happy", "骄傲", "专注完成了，它正在为你庆祝。");
    speak("完成啦，休息一下吧！");
    addAffection(3);
    hearts(7);
    showToast("专注完成，获得 3 点忠诚度");
  } else {
    setMood("idle", "开心", "随时可以再开始一段安静的陪伴。");
  }
}

function toggleTimer() {
  if (timerId) {
    stopTimer();
    return;
  }
  setMood("focus-mode", "陪伴中", "它已经安静坐好，陪你完成这段专注。");
  speak("我会安静陪着你");
  els.timerToggle.textContent = "暂停计时";
  timerId = setInterval(() => {
    timerSeconds -= 1;
    updateTimer();
    if (timerSeconds <= 0) {
      timerSeconds = state.focusMinutes * 60;
      updateTimer();
      stopTimer(true);
    }
  }, 1000);
}

function beginDrag(event) {
  if (event.button !== 0) return;
  lastInteraction = Date.now();
  const rect = els.pet.getBoundingClientRect();
  dragState = {
    startX: event.clientX,
    startY: event.clientY,
    petLeft: rect.left + rect.width / 2,
    petBottom: window.innerHeight - rect.bottom,
    lastX: event.clientX,
    moved: false,
  };
  els.pet.setPointerCapture(event.pointerId);
  nativeMessage("dragStart");
}

function moveDrag(event) {
  if (!dragState) return;
  const deltaX = event.clientX - dragState.startX;
  const deltaY = event.clientY - dragState.startY;
  if (Math.hypot(deltaX, deltaY) > 4) {
    dragState.moved = true;
    els.pet.classList.add("dragging");
  }
  const velocityX = event.clientX - dragState.lastX;
  dragState.lastX = event.clientX;
  els.pet.style.setProperty("--drag-rotate", `${Math.max(-12, Math.min(12, velocityX * 1.2))}deg`);
  els.pet.style.setProperty("--drag-lift", `${Math.max(-12, Math.min(4, deltaY * .05 - 5))}px`);

  if (nativeDesktop) {
    nativeMessage("dragMove");
    closeQuickPanel();
    return;
  }

  const zoneRect = els.petZone.getBoundingClientRect();
  const newCenter = Math.max(zoneRect.left + 90, Math.min(zoneRect.right - 90, dragState.petLeft + deltaX));
  const newBottom = Math.max(8, Math.min(zoneRect.height - 180, dragState.petBottom - deltaY));
  state.position = ((newCenter - zoneRect.left) / zoneRect.width) * 100;
  state.positionY = newBottom;
  els.pet.style.left = `${state.position}%`;
  els.pet.style.bottom = `${state.positionY}px`;
  els.bubble.classList.remove("show");
  closeQuickPanel();
}

function endDrag(event) {
  if (!dragState) return;
  els.pet.releasePointerCapture(event.pointerId);
  els.pet.classList.remove("dragging");
  els.pet.style.removeProperty("--drag-rotate");
  els.pet.style.removeProperty("--drag-lift");
  if (dragState.moved) {
    speak("这里也不错！");
    saveState();
  } else {
    openQuickPanel();
  }
  dragState = null;
}

function scheduleIdleBehavior() {
  clearTimeout(idleTimer);
  const tick = () => {
    if (!timerId && !dragState) {
      const idleFor = Date.now() - lastInteraction;
      if (idleFor > 42000 && petMood !== "sleeping") {
        setMood("sleeping", "困倦", "周围很安静，它慢慢睡着了。");
        speak("zzz…");
      } else if (idleFor < 42000 && petMood === "sleeping") {
        setMood("idle", "开心", "它醒来了，正在看看你有没有回来。");
      } else if (idleFor > 2500 && idleFor < 42000 && petMood === "idle") {
        playAction(playfulActions[Math.floor(Math.random() * playfulActions.length)]);
      }
    }
    const nextDelay = nativeDesktop ? 5200 + Math.random() * 5200 : 7800 + Math.random() * 7600;
    idleTimer = setTimeout(tick, nextDelay);
  };
  idleTimer = setTimeout(tick, nativeDesktop ? 2800 : 5200);
}

$("#pettingButton").addEventListener("click", petInteraction);
$("#treatButton").addEventListener("click", feedTreat);
$("#playButton").addEventListener("click", () => playAction());
$("#closeQuickPanel").addEventListener("click", closeQuickPanel);
$("#closetButton").addEventListener("click", () => {
  closeQuickPanel();
  els.nameInput.value = state.name;
  toggleDrawer(els.closet);
});
$("#settingsButton").addEventListener("click", () => toggleDrawer(els.settings));
$("#panelSettingsButton").addEventListener("click", () => {
  closeQuickPanel();
  nativeMessage("drawer");
  toggleDrawer(els.settings);
});
$("#focusButton").addEventListener("click", () => {
  els.quickPanel.classList.add("hidden");
  els.closet.classList.add("hidden");
  els.settings.classList.add("hidden");
  els.focusCard.classList.remove("hidden");
  nativeMessage("focus");
});
$("#closeFocus").addEventListener("click", () => {
  els.focusCard.classList.add("hidden");
  nativeMessage("compact");
});
$("#timerToggle").addEventListener("click", toggleTimer);

$$("[data-close]").forEach((button) => button.addEventListener("click", () => {
  $(`#${button.dataset.close}`).classList.add("hidden");
  nativeMessage("compact");
}));

$("#skinChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-skin]");
  if (!button) return;
  state.skin = button.dataset.skin;
  state.species = currentSkin().species;
  blinking = false;
  blinkFrameSrc = "";
  stopMotionFrames();
  render();
  speak(`${currentSkin().label}登场！`);
});

$("#personalityChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-personality]");
  if (!button) return;
  state.personality = button.dataset.personality;
  render();
});

$("#savePet").addEventListener("click", () => {
  state.name = els.nameInput.value.trim() || defaults.name;
  saveState();
  render();
  els.closet.classList.add("hidden");
  setMood("happy", "开心", `${state.name}很喜欢自己的新造型。`);
  speak("这个造型喜欢吗？");
  hearts(5);
  showToast("新造型已经保存");
  setTimeout(() => setMood("idle", "开心"), 1200);
});

$("#timerPresets").addEventListener("click", (event) => {
  const button = event.target.closest("[data-minutes]");
  if (!button || timerId) return;
  state.focusMinutes = Number(button.dataset.minutes);
  timerSeconds = state.focusMinutes * 60;
  $$("#timerPresets button").forEach((item) => item.classList.toggle("selected", item === button));
  updateTimer();
  saveState();
});

$("#soundButton").addEventListener("click", () => {
  state.sound = !state.sound;
  saveState();
  render();
  showToast(state.sound ? "轻柔音效已打开" : "音效已关闭");
});

$("#soundToggle").addEventListener("change", (event) => {
  state.sound = event.target.checked;
  saveState();
  render();
});

$("#bubbleToggle").addEventListener("change", (event) => {
  state.bubbles = event.target.checked;
  saveState();
});

$("#sizeRange").addEventListener("input", (event) => {
  state.size = Number(event.target.value);
  render();
});

$("#sizeRange").addEventListener("change", saveState);

$("#resetButton").addEventListener("click", () => {
  Object.assign(state, defaults);
  timerSeconds = state.focusMinutes * 60;
  saveState();
  render();
  els.nameInput.value = state.name;
  updateTimer();
  showToast("已经恢复初始状态");
});

els.pet.addEventListener("pointerdown", beginDrag);
els.pet.addEventListener("pointermove", moveDrag);
els.pet.addEventListener("pointerup", endDrag);
els.pet.addEventListener("pointercancel", endDrag);
els.pet.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") petInteraction();
});

document.addEventListener("pointermove", (event) => {
  if (dragState || timerId || petMood === "sleeping") return;
  const rect = els.pet.getBoundingClientRect();
  const distance = Math.abs(event.clientX - (rect.left + rect.width / 2));
  if (distance < 170) lastInteraction = Date.now();
});

window.addEventListener("resize", () => {
  if (!els.quickPanel.classList.contains("hidden")) positionQuickPanel();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) applyLoyaltyDecay({ notify: true });
});

applyLoyaltyDecay();
render();
preloadMotionFrames();
els.nameInput.value = state.name;
timerSeconds = state.focusMinutes * 60;
updateTimer();
scheduleIdleBehavior();
scheduleBlinking();
scheduleLoyaltyDecay();
setTimeout(() => speak("摸摸头吗？", 2400), 650);

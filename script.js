/* ============================================================
   KONFIGURASI — edit bagian ini saja untuk personalisasi
   ============================================================ */
const CONFIG = {
  recipientName: "Sayang",            // GANTI NAMA DI SINI (belum dipakai otomatis di teks surat,
                                       // tapi disiapkan kalau kamu mau memakainya lewat JS nanti)
  music: "audio/romantic-piano.mp3",  // GANTI MUSIK DI SINI (ganti file di folder /audio/)
                                       // PENTING: jangan pakai "/" di depan (misal "/audio/...")
                                       // karena itu akan dibaca sebagai path dari root server,
                                       // bukan dari folder project ini.
  defaultVolume: 0.3                  // GANTI VOLUME DI SINI (0.0 - 1.0)
};

// GANTI FOTO DI SINI — tambah/kurangi/ubah src & caption sesuka kamu.
// "tilt" opsional: sedikit rotasi (derajat) supaya terasa seperti polaroid ditempel manual.
const PHOTOS = [
  // GANTI CAPTION DI SINI juga ada di properti "caption" masing-masing foto
  { src: "images/foto1.jpg", caption: "sebuah momen kecil yang berarti.", tilt: -3 },
  { src: "images/foto2.jpg", caption: "hari itu, yang selalu aku ingat.", tilt: 2 },
  { src: "images/foto3.jpg", caption: "senyum yang paling aku suka.", tilt: -2 },
  { src: "images/foto4.jpg", caption: "kita, di salah satu hari baik.", tilt: 3 }
];

/* ============================================================
   STATE
   ============================================================ */
const STATES = ["opening", "envelope", "letter", "memories", "ending"];
let currentState = "opening";
let hasOpened = false; // mencegah tombol diproses lebih dari sekali

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  renderPhotos();
  setupAudio();
  setupMusicControls();
  setupRevealObserver();
  setupOpenLetterButton();
  if (!prefersReducedMotion) {
    spawnParticles();
  }
});

/* ============================================================
   RENDER FOTO KENANGAN
   ============================================================ */
function renderPhotos() {
  const grid = document.getElementById("polaroid-grid");
  if (!grid) return;

  PHOTOS.forEach((photo, index) => {
    const figure = document.createElement("figure");
    figure.className = "polaroid reveal";
    figure.style.setProperty("--tilt", `${photo.tilt ?? 0}deg`);
    figure.setAttribute("data-delay", String(index * 120));

    const img = document.createElement("img");
    img.className = "polaroid-photo";
    img.src = photo.src;
    img.alt = photo.caption || `kenangan ${index + 1}`;
    img.loading = "lazy";
    // jika foto belum ada / gagal dimuat, jangan sampai layout rusak atau console error mengganggu.
    img.addEventListener("error", () => {
      img.style.display = "none";
      figure.classList.add("photo-missing");
    });

    const caption = document.createElement("figcaption");
    caption.textContent = photo.caption || "";

    figure.appendChild(img);
    figure.appendChild(caption);
    grid.appendChild(figure);
  });
}

/* ============================================================
   TOMBOL "BUKA SURAT" + ALUR SINEMATIK AMPLOP
   ============================================================ */
function setupOpenLetterButton() {
  const btn = document.getElementById("open-letter-btn");
  if (!btn) return;

  btn.addEventListener("click", handleOpenLetter, { once: true });
}

function handleOpenLetter() {
  if (hasOpened || currentState !== "opening") return;
  hasOpened = true;
  currentState = "envelope";

  const btn = document.getElementById("open-letter-btn");
  const openingScene = document.getElementById("opening-scene");
  const envelopeScene = document.getElementById("envelope-scene");
  const envelope = document.getElementById("envelope");
  const flap = document.getElementById("envelope-flap");
  const paper = document.getElementById("envelope-paper");
  const overlay = document.getElementById("intro-overlay");

  btn.disabled = true;
  btn.setAttribute("aria-disabled", "true");

  const T = prefersReducedMotion
    ? { fadeOpening: 150, envelopeIn: 150, flapOpen: 150, paperOut: 150, holdBeforeFade: 150, fadeOut: 200 }
    : { fadeOpening: 500, envelopeIn: 700, flapOpen: 750, paperOut: 900, holdBeforeFade: 400, fadeOut: 900 };

  // 1) opening memudar
  openingScene.classList.add("opening-fade-out");

  window.setTimeout(() => {
    openingScene.hidden = true;
    envelopeScene.hidden = false;

    // paksa reflow supaya transisi berikutnya benar-benar ter-trigger
    void envelope.offsetWidth;
    envelope.classList.add("envelope-in");
  }, T.fadeOpening);

  // 2) amplop muncul, lalu flap terbuka
  window.setTimeout(() => {
    flap.classList.add("flap-open");
    // 3) musik mulai bersamaan dengan amplop terbuka
    playMusic();
  }, T.fadeOpening + T.envelopeIn);

  // 4) surat keluar dari amplop
  window.setTimeout(() => {
    paper.classList.add("paper-out");
  }, T.fadeOpening + T.envelopeIn + T.flapOpen * 0.55);

  // 5) amplop & overlay memudar bersamaan
  window.setTimeout(() => {
    envelope.classList.add("envelope-fade");
    overlay.classList.add("overlay-hide");
  }, T.fadeOpening + T.envelopeIn + T.flapOpen * 0.55 + T.paperOut + T.holdBeforeFade);

  // 6) overlay benar-benar hilang, tampilkan kontrol musik, scroll ke surat
  window.setTimeout(() => {
    overlay.classList.add("overlay-gone");
    currentState = "letter";
    showMusicControl();
    scrollToLetter();
  }, T.fadeOpening + T.envelopeIn + T.flapOpen * 0.55 + T.paperOut + T.holdBeforeFade + T.fadeOut);
}

function scrollToLetter() {
  const letterSection = document.getElementById("letter");
  if (!letterSection) return;
  letterSection.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start"
  });
}

/* ============================================================
   AUDIO
   ============================================================ */
let audioEl;
let fadeInterval = null;
let userVolume = CONFIG.defaultVolume;
let audioAvailable = true;

function setupAudio() {
  audioEl = document.getElementById("bg-music");
  if (!audioEl) return;

  audioEl.src = CONFIG.music;
  audioEl.volume = 0;

  // baca preferensi tersimpan (kalau ada), tapi TIDAK autoplay
  const savedVolume = localStorage.getItem("birthday-music-volume");
  const savedMuted = localStorage.getItem("birthday-music-muted");

  if (savedVolume !== null) {
    userVolume = clamp(parseFloat(savedVolume), 0, 1);
  }

  const slider = document.getElementById("volume-slider");
  if (slider) slider.value = String(Math.round(userVolume * 100));

  if (savedMuted === "true") {
    setMusicIcon(false);
  }

  // kalau file audio tidak ditemukan / gagal dimuat, website tetap berjalan normal
  audioEl.addEventListener("error", () => {
    audioAvailable = false;
    const control = document.getElementById("music-control");
    if (control) control.hidden = true;
    console.warn("Musik tidak dapat dimuat. Website tetap berjalan tanpa musik.");
  });
}

function playMusic() {
  if (!audioEl || !audioAvailable) return;

  const savedMuted = localStorage.getItem("birthday-music-muted");
  if (savedMuted === "true") return; // hormati pilihan user sebelumnya untuk tidak memutar musik

  const playPromise = audioEl.play();

  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        fadeAudioTo(userVolume, prefersReducedMotion ? 300 : 2500);
      })
      .catch(() => {
        // browser menolak autoplay atau file bermasalah — biarkan website tetap berjalan normal
        audioAvailable = audioAvailable && true;
      });
  }
}

function fadeAudioTo(target, duration) {
  if (!audioEl) return;
  window.clearInterval(fadeInterval);

  const steps = 30;
  const stepTime = Math.max(16, duration / steps);
  const start = audioEl.volume;
  const diff = target - start;
  let count = 0;

  fadeInterval = window.setInterval(() => {
    count++;
    const progress = count / steps;
    audioEl.volume = clamp(start + diff * progress, 0, 1);
    if (count >= steps) {
      audioEl.volume = clamp(target, 0, 1);
      window.clearInterval(fadeInterval);
    }
  }, stepTime);
}

function setupMusicControls() {
  const toggleBtn = document.getElementById("music-toggle");
  const slider = document.getElementById("volume-slider");
  const control = document.getElementById("music-control");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (!audioEl || !audioAvailable) return;

      toggleBtn.classList.remove("bump");
      void toggleBtn.offsetWidth;
      toggleBtn.classList.add("bump");

      if (audioEl.paused) {
        audioEl.play().then(() => {
          fadeAudioTo(userVolume, 800);
          setMusicIcon(true);
          localStorage.setItem("birthday-music-muted", "false");
        }).catch(() => {});
      } else {
        fadeAudioTo(0, 700);
        window.setTimeout(() => audioEl.pause(), 720);
        setMusicIcon(false);
        localStorage.setItem("birthday-music-muted", "true");
      }
    });
  }

  if (slider) {
    slider.addEventListener("input", (e) => {
      userVolume = clamp(parseFloat(e.target.value) / 100, 0, 1);
      if (audioEl) audioEl.volume = userVolume;
      localStorage.setItem("birthday-music-volume", String(userVolume));
    });
  }

  if (control) {
    // tap untuk membuka slider volume di HP (selain hover di desktop)
    control.addEventListener("click", (e) => {
      if (e.target === slider) return;
      control.classList.toggle("show-volume");
    });
  }
}

function setMusicIcon(isPlaying) {
  const icon = document.getElementById("music-icon");
  const toggleBtn = document.getElementById("music-toggle");
  if (!icon) return;
  icon.textContent = isPlaying ? "🎵" : "🔇";
  if (toggleBtn) toggleBtn.setAttribute("aria-pressed", String(isPlaying));
}

function showMusicControl() {
  const control = document.getElementById("music-control");
  if (!control || !audioAvailable) return;
  control.hidden = false;
  requestAnimationFrame(() => control.classList.add("music-visible"));
}

/* ============================================================
   SCROLL REVEAL (surat, foto, penutup)
   ============================================================ */
function setupRevealObserver() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const delay = Number(entry.target.getAttribute("data-delay") || 0);
          window.setTimeout(() => entry.target.classList.add("in-view"), delay);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );

  items.forEach((el) => observer.observe(el));

  // foto dirender setelah DOMContentLoaded, jadi observasi ulang node baru di grid foto
  const grid = document.getElementById("polaroid-grid");
  if (grid) {
    grid.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
  }
}

/* ============================================================
   PARTIKEL & KELOPAK BUNGA (dekorasi opening)
   ============================================================ */
function spawnParticles() {
  const field = document.getElementById("particle-field");
  if (!field) return;

  const sparkCount = 14;
  const petalCount = 9;

  for (let i = 0; i < sparkCount; i++) {
    const el = document.createElement("span");
    el.className = "spark";
    el.style.left = `${Math.random() * 100}%`;
    el.style.setProperty("--drift", `${(Math.random() - 0.5) * 60}px`);
    el.style.animationDuration = `${7 + Math.random() * 6}s`;
    el.style.animationDelay = `${Math.random() * 8}s`;
    field.appendChild(el);
  }

  for (let i = 0; i < petalCount; i++) {
    const el = document.createElement("span");
    el.className = "petal";
    el.style.left = `${Math.random() * 100}%`;
    el.style.setProperty("--drift", `${(Math.random() - 0.5) * 80}px`);
    el.style.animationDuration = `${10 + Math.random() * 8}s`;
    el.style.animationDelay = `${Math.random() * 10}s`;
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    field.appendChild(el);
  }
}

/* ============================================================
   UTIL
   ============================================================ */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
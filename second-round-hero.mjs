const SELECTOR = "[data-flight-transition]";
const HERO_VIDEO = "/hero/intro/reball_intro_1.mp4";
const HERO_POSTER = "./assets/figma/hero-poster.webp";
const HERO_ENDING = "/hero/drop/10.webp";

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const invLerp = (start, end, value) => clamp((value - start) / (end - start));
const smoothstep = (start, end, value) => {
  const t = invLerp(start, end, value);
  return t * t * (3 - 2 * t);
};

let activeHero = null;
let observer = null;
let mountQueued = false;

function sceneMarkup() {
  return `
    <div class="second-round-stage" data-second-round-stage>
      <div class="second-round-media" data-second-round-media aria-hidden="true">
        <video class="second-round-video" data-second-round-video src="${HERO_VIDEO}" poster="${HERO_POSTER}" muted playsinline preload="auto"></video>
        <img class="second-round-ending" data-second-round-ending src="${HERO_ENDING}" alt="" decoding="async" />
        <div class="second-round-shade"></div>
        <div class="second-round-grain"></div>
      </div>

      <div class="second-round-ui">
        <div class="second-round-kicker" aria-hidden="true">
          <span>REBALL / SECOND ROUND</span>
          <b data-second-round-counter>01 / 03</b>
        </div>

        <div class="second-round-scenes" aria-live="off">
          <article class="second-round-copy is-active" data-second-round-copy="0">
            <p class="second-round-eyebrow">SECOND ROUND</p>
            <h1>한 번의 라운드가 끝났다고<br />공의 역할까지 끝난 건 아닙니다.</h1>
            <p class="second-round-subcopy">스크롤해서 한 개의 공이 다시 라운드로 돌아가는 과정을 따라가 보세요.</p>
          </article>

          <article class="second-round-copy" data-second-round-copy="1" aria-hidden="true">
            <p class="second-round-eyebrow">USED IS NOT FINISHED.</p>
            <h2>사용됐다는 것과,<br />끝났다는 것은 다릅니다.</h2>
            <p class="second-round-subcopy">흔적은 남기고, 플레이를 방해하는 손상은 걸러냅니다.</p>
          </article>

          <article class="second-round-copy" data-second-round-copy="2" aria-hidden="true">
            <p class="second-round-eyebrow">RE:CHECK</p>
            <h2>다시 씻고.<br />다시 보고.<br />다시 고릅니다.</h2>
            <p class="second-round-subcopy">세척과 검수, 등급 분류를 거쳐 다시 선택 가능한 공으로 만듭니다.</p>
          </article>
        </div>

        <div class="second-round-progress" aria-hidden="true">
          <span class="second-round-progress-track"><i data-second-round-progress></i></span>
          <small>SCROLL</small>
        </div>
      </div>
    </div>
  `;
}

function promoteProductsAfterHero(section) {
  const products = document.getElementById("products");
  if (!products) return;

  if (section.nextElementSibling !== products) section.after(products);

  const productGrid = products.querySelector(".featured-product-grid");
  const carousel = products.querySelector("[data-home-carousel]");
  if (productGrid && carousel && carousel.previousElementSibling !== productGrid) {
    products.insertBefore(productGrid, carousel);
  }
}

function createHero(oldSection) {
  oldSection.querySelectorAll("video").forEach((video) => {
    try { video.pause(); } catch {}
  });

  const section = document.createElement("section");
  section.className = "second-round-hero";
  section.dataset.homeStage = "1";
  section.dataset.secondRoundHero = "";
  section.setAttribute("aria-label", "리볼 로스트볼, 공의 두 번째 라운드");
  section.innerHTML = sceneMarkup();
  oldSection.replaceWith(section);
  promoteProductsAfterHero(section);

  const stage = section.querySelector("[data-second-round-stage]");
  const video = section.querySelector("[data-second-round-video]");
  const ending = section.querySelector("[data-second-round-ending]");
  const progressBar = section.querySelector("[data-second-round-progress]");
  const counter = section.querySelector("[data-second-round-counter]");
  const copies = [...section.querySelectorAll("[data-second-round-copy]")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const compactViewport = window.matchMedia("(max-width: 760px)").matches;

  // The actual video owns the cinematic, then crossfades into one intentional
  // golf/hole ending still. No generated frame sequence, card, ornament or CTA.
  section.style.height = reducedMotion ? "100svh" : compactViewport ? "205vh" : "240vh";

  let videoDuration = 0;
  let target = 0;
  let current = 0;
  let raf = 0;
  let lastScene = -1;
  let destroyed = false;

  const setScene = (index) => {
    if (index === lastScene) return;
    lastScene = index;
    copies.forEach((copy, copyIndex) => {
      const active = copyIndex === index;
      copy.classList.toggle("is-active", active);
      copy.setAttribute("aria-hidden", active ? "false" : "true");
    });
    counter.textContent = `${String(index + 1).padStart(2, "0")} / 03`;
  };

  const updateVisuals = (p) => {
    const scene = p < 0.30 ? 0 : p < 0.62 ? 1 : 2;
    setScene(scene);

    // Start the ending before the video's sky-only tail can become a held frame.
    const endingPhase = smoothstep(0.80, 0.89, p);
    const copyExit = smoothstep(0.78, 0.88, p);
    const shadeOpacity = 1 - 0.34 * smoothstep(0.72, 0.96, p);
    const grainOpacity = Math.max(0.02, 0.09 * (1 - 0.55 * p));

    stage.style.setProperty("--sr-progress", p.toFixed(4));
    stage.style.setProperty("--sr-video-opacity", (1 - endingPhase).toFixed(4));
    stage.style.setProperty("--sr-ending-opacity", endingPhase.toFixed(4));
    stage.style.setProperty("--sr-copy-opacity", (1 - copyExit).toFixed(4));
    stage.style.setProperty("--sr-shade-opacity", shadeOpacity.toFixed(4));
    stage.style.setProperty("--sr-grain-opacity", grainOpacity.toFixed(4));
    progressBar.style.transform = `scaleX(${p})`;

    document.body.classList.toggle("second-round-active", p < 0.99 && section.isConnected);

    if (videoDuration > 0 && !reducedMotion) {
      // Finish the video while the intentional ending still is already fading in,
      // so the user never lands on a sky-only frozen tail.
      const scrub = clamp(p / 0.84);
      const nextTime = scrub * Math.max(0, videoDuration - 0.04);
      if (Number.isFinite(nextTime) && Math.abs(video.currentTime - nextTime) > 0.02) {
        try { video.currentTime = nextTime; } catch {}
      }
    }

    if (ending && p > 0.76 && !ending.complete) {
      try { ending.decode?.().catch(() => {}); } catch {}
    }
  };

  const tick = () => {
    if (destroyed || !section.isConnected) return;
    const delta = target - current;
    current += delta * (compactViewport ? 0.24 : 0.22);
    if (Math.abs(delta) < 0.0008) current = target;
    updateVisuals(current);
    if (current !== target) raf = window.requestAnimationFrame(tick);
    else raf = 0;
  };

  const requestTick = () => {
    if (!raf) raf = window.requestAnimationFrame(tick);
  };

  const measure = () => {
    if (reducedMotion) {
      section.classList.add("is-reduced-motion");
      updateVisuals(1);
      document.body.classList.remove("second-round-active");
      return;
    }
    const rect = section.getBoundingClientRect();
    const scrollable = Math.max(1, section.offsetHeight - window.innerHeight);
    target = clamp(-rect.top / scrollable);
    requestTick();
  };

  const onMetadata = () => {
    videoDuration = Number.isFinite(video.duration) ? video.duration : 0;
    try { video.pause(); } catch {}
    measure();
  };

  video.addEventListener("loadedmetadata", onMetadata);
  video.addEventListener("canplay", () => { try { video.pause(); } catch {} }, { passive: true });
  window.addEventListener("scroll", measure, { passive: true });
  window.addEventListener("resize", measure, { passive: true });

  measure();

  return {
    section,
    destroy() {
      destroyed = true;
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      video.removeEventListener("loadedmetadata", onMetadata);
      document.body.classList.remove("second-round-active");
    },
  };
}

function mountIfNeeded() {
  mountQueued = false;
  const existing = document.querySelector("[data-second-round-hero]");
  if (existing) return;

  const oldSection = document.querySelector(SELECTOR);
  if (!oldSection) {
    if (activeHero && !activeHero.section.isConnected) {
      activeHero.destroy();
      activeHero = null;
    }
    return;
  }

  activeHero?.destroy();
  activeHero = createHero(oldSection);
}

function queueMount() {
  if (mountQueued) return;
  mountQueued = true;
  queueMicrotask(mountIfNeeded);
}

function start() {
  queueMount();
  const root = document.getElementById("app") || document.body;
  observer = new MutationObserver(queueMount);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("hashchange", queueMount, { passive: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();

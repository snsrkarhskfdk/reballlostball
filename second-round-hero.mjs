const SELECTOR = "[data-flight-transition]";
const HERO_VIDEO = "/hero/intro/reball_intro_1.mp4";
const HERO_POSTER = "./assets/figma/hero-poster.webp";

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
  const progressBar = section.querySelector("[data-second-round-progress]");
  const counter = section.querySelector("[data-second-round-counter]");
  const copies = [...section.querySelectorAll("[data-second-round-copy]")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const compactViewport = window.matchMedia("(max-width: 760px)").matches;

  // The cinematic is the entire hero. There is no post-video still, frame sequence,
  // landing card, ornament or intermediate screen. As the video reaches its final
  // frame, the sticky hero ends and the normal #products storefront takes over.
  section.style.height = reducedMotion ? "100svh" : compactViewport ? "190vh" : "220vh";

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
    const scene = p < 0.30 ? 0 : p < 0.64 ? 1 : 2;
    setScene(scene);

    const copyExit = smoothstep(0.92, 0.995, p);
    const shadeOpacity = 1 - 0.28 * smoothstep(0.72, 0.98, p);
    const grainOpacity = Math.max(0.02, 0.09 * (1 - 0.55 * p));

    stage.style.setProperty("--sr-progress", p.toFixed(4));
    stage.style.setProperty("--sr-copy-opacity", (1 - copyExit).toFixed(4));
    stage.style.setProperty("--sr-shade-opacity", shadeOpacity.toFixed(4));
    stage.style.setProperty("--sr-grain-opacity", grainOpacity.toFixed(4));
    progressBar.style.transform = `scaleX(${p})`;

    // Restore the normal header only at the very end so it belongs to the storefront,
    // not to a fake final hero scene.
    document.body.classList.toggle("second-round-active", p < 0.99 && section.isConnected);

    if (videoDuration > 0 && !reducedMotion) {
      // Consume essentially the full scroll range with the actual video. The old
      // implementation ended the video around 64% and then held generated stills.
      const scrub = clamp(p / 0.995);
      const nextTime = scrub * Math.max(0, videoDuration - 0.015);
      if (Number.isFinite(nextTime) && Math.abs(video.currentTime - nextTime) > 0.02) {
        try { video.currentTime = nextTime; } catch {}
      }
    }
  };

  const tick = () => {
    if (destroyed || !section.isConnected) return;
    const delta = target - current;
    current += delta * (compactViewport ? 0.20 : 0.14);
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
      updateVisuals(0);
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

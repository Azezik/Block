const STORY_MARKUP = `
  <section class="landing-story" aria-label="Stakblox introduction">
    <div class="landing-hero-wrap">
      <div class="landing-hero" data-reveal>
        <p class="landing-eyebrow">STAKBLOX</p>
        <h1>STAKBLOX</h1>
        <h2>Advanced investing — without the jargon</h2>
        <div class="landing-hero-motif" aria-hidden="true">
          <span class="motif-crate motif-crate-1"></span>
          <span class="motif-crate motif-crate-2"></span>
          <span class="motif-crate motif-crate-3"></span>
          <span class="motif-block motif-block-a"></span>
          <span class="motif-block motif-block-b"></span>
          <span class="motif-block motif-block-c"></span>
        </div>
      </div>
    </div>

    <section class="story-beat story-chapter story-problem" data-reveal>
      <h2>Why investing feels hard (even when you’re disciplined)</h2>
      <p>Most people know they should invest.</p>
      <p>What stops them isn’t discipline — it’s uncertainty.</p>
      <p>You’re told small decisions matter: where to put money, when to adjust, how much each should hold.</p>
      <p>Percent allocations. Rebalancing. Asset weighting.</p>
      <p>But no one shows you how these feel in practice — so every choice feels risky, and not starting feels safer.</p>
    </section>

    <section class="story-beat story-chapter story-shift" data-reveal>
      <h2>Stop learning. Start doing.</h2>
      <p>Stakblox removes that fog.</p>
      <p>Instead of studying investing, you do investing — inside a visual system your brain instantly understands.</p>
      <p>Less theory. More action.</p>
    </section>

    <section class="story-beat story-chapter story-on-ramp" data-reveal>
      <h2>You already save monthly. Here’s the missing step.</h2>
      <p>You already set aside money each month.</p>
      <p>The hard part isn’t saving — it’s knowing what to do with it.</p>
      <p>Stakblox is your on-ramp.</p>
      <p>Each month becomes a clear, repeatable action — no more decisions, just motion.</p>
    </section>

    <section class="story-beat story-chapter story-how" data-reveal>
      <h2>How it works</h2>
      <p>You don’t start with charts or terms.</p>
      <p>You start with blocks.</p>
      <div class="how-layout">
        <ol class="how-steps" aria-label="How it works steps">
          <li data-reveal-item><strong>1</strong><span>Receive a block.</span></li>
          <li data-reveal-item><strong>2</strong><span>Place it in the lowest crate.</span></li>
          <li data-reveal-item><strong>3</strong><span>Repeat.</span></li>
          <li data-reveal-item><strong>4</strong><span>Keep the crates level — that’s automatic diversification and balance.</span></li>
          <li data-reveal-item><strong>5</strong><span>When a stack completes, start the next one the same way.</span></li>
          <li data-reveal-item><strong>6</strong><span>No math. No second-guessing. Just maintain the structure.</span></li>
        </ol>
        <div class="how-visual" aria-hidden="true">
          <div class="how-crates">
            <span class="how-crate"></span>
            <span class="how-crate"></span>
            <span class="how-crate"></span>
          </div>
          <span class="how-block how-block-1"></span>
          <span class="how-block how-block-2"></span>
          <span class="how-block how-block-3"></span>
          <span class="how-block how-block-4"></span>
        </div>
      </div>
    </section>

    <section class="story-beat story-chapter story-meaning" data-reveal>
      <h2>What it means in real life</h2>
      <div class="translation-grid" role="table" aria-label="Stakblox translation guide">
        <div class="translation-head" role="row">
          <span role="columnheader">Concept</span>
          <span role="columnheader">Plain-English meaning</span>
        </div>
        <div class="translation-row" role="row" data-reveal-item><strong role="cell">Each crate</strong><span role="cell">one investment</span></div>
        <div class="translation-row" role="row" data-reveal-item><strong role="cell">Each block</strong><span role="cell">a contribution</span></div>
        <div class="translation-row" role="row" data-reveal-item><strong role="cell">Each stack</strong><span role="cell">a balanced portfolio</span></div>
        <div class="translation-row" role="row" data-reveal-item><strong role="cell">Keeping crates level</strong><span role="cell">diversification &amp; rebalancing</span></div>
        <div class="translation-row" role="row" data-reveal-item><strong role="cell">Building new stacks</strong><span role="cell">continuous investing</span></div>
      </div>
      <p>You’ve performed real portfolio management — without learning the vocabulary first.</p>
      <p>The logic clicks because you felt it before you named it.</p>
      <p>Every move generates simple instructions you copy to your brokerage account.</p>
      <p>No charts to interpret. No percentages to calculate.</p>
    </section>
  </section>
`;

export function initLandingScrollStory(mountId = 'landingStory') {
  const mountNode = document.getElementById(mountId);
  if (!mountNode) return;

  mountNode.innerHTML = STORY_MARKUP;

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const allRevealNodes = mountNode.querySelectorAll('[data-reveal], [data-reveal-item]');
  const howVisual = mountNode.querySelector('.how-visual');
  const hero = mountNode.querySelector('.landing-hero');

  const applyReducedMotionState = (isReduced) => {
    mountNode.classList.toggle('reduced-motion', isReduced);

    if (isReduced) {
      allRevealNodes.forEach((node) => node.classList.add('is-visible'));
      if (howVisual) howVisual.classList.add('is-active');
      return;
    }

    allRevealNodes.forEach((node) => node.classList.remove('is-visible'));
  };

  const startObserverAnimations = () => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    }, {
      root: null,
      threshold: 0.2,
      rootMargin: '0px 0px -10% 0px'
    });

    allRevealNodes.forEach((node) => observer.observe(node));

    if (howVisual) {
      const visualObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          howVisual.classList.toggle('is-active', entry.isIntersecting);
        });
      }, {
        threshold: 0.35
      });
      visualObserver.observe(howVisual);
    }
  };

  const startHeroParallax = () => {
    if (!hero) return;
    let ticking = false;

    const updateParallax = () => {
      const rect = hero.getBoundingClientRect();
      const shift = Math.max(-20, Math.min(20, rect.top * -0.06));
      hero.style.setProperty('--hero-parallax', `${shift.toFixed(2)}px`);
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateParallax);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateParallax();
  };

  const reducedMotion = reduceMotionQuery.matches;
  applyReducedMotionState(reducedMotion);
  if (!reducedMotion) {
    startObserverAnimations();
    startHeroParallax();
  }
}

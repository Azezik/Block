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

    <section class="story-beat" data-reveal>
      <p>Most people know they should invest.</p>
      <p>What stops them isn’t discipline — it’s uncertainty.</p>
      <p>You’re told small decisions matter: where to put money, when to adjust, how much each should hold.</p>
      <p>Percent allocations. Rebalancing. Asset weighting.</p>
      <p>But no one shows you how these feel in practice — so every choice feels risky, and not starting feels safer.</p>
    </section>

    <section class="story-beat" data-reveal>
      <p>Stakblox removes that fog.</p>
      <p>Instead of studying investing, you do investing — inside a visual system your brain instantly understands.</p>
    </section>

    <section class="story-beat" data-reveal>
      <p>You already set aside money each month.</p>
      <p>The hard part isn’t saving — it’s knowing what to do with it.</p>
      <p>Stakblox is your on-ramp.</p>
      <p>Each month becomes a clear, repeatable action — no more decisions, just motion.</p>
    </section>

    <section class="story-beat story-how" data-reveal>
      <h2>How it works</h2>
      <p>You don’t start with charts or terms.</p>
      <p>You start with blocks.</p>
      <div class="how-layout">
        <ol class="how-steps" aria-label="How it works steps">
          <li data-reveal-item>Receive a block.</li>
          <li data-reveal-item>Place it in the lowest crate.</li>
          <li data-reveal-item>Repeat.</li>
          <li data-reveal-item>Keep the crates level — that’s automatic diversification and balance.</li>
          <li data-reveal-item>When a stack completes, start the next one the same way.</li>
          <li data-reveal-item>No math. No second-guessing. Just maintain the structure.</li>
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

    <section class="story-beat" data-reveal>
      <h2>What you’ve actually been doing</h2>
      <div class="translation-grid" role="list" aria-label="Stakblox translation guide">
        <div class="translation-row" role="listitem" data-reveal-item><strong>Each crate</strong><span>= one investment</span></div>
        <div class="translation-row" role="listitem" data-reveal-item><strong>Each block</strong><span>= a contribution</span></div>
        <div class="translation-row" role="listitem" data-reveal-item><strong>Each stack</strong><span>= a balanced portfolio</span></div>
        <div class="translation-row" role="listitem" data-reveal-item><strong>Keeping crates level</strong><span>= diversification &amp; rebalancing</span></div>
        <div class="translation-row" role="listitem" data-reveal-item><strong>Building new stacks</strong><span>= continuous investing</span></div>
      </div>
      <p>You’ve performed real portfolio management — without learning the vocabulary first.</p>
      <p>The logic clicks because you felt it before you named it.</p>
    </section>

    <section class="story-beat" data-reveal>
      <h2>In real life</h2>
      <p>Every move generates simple instructions you copy to your brokerage account.</p>
      <p>No charts to interpret. No percentages to calculate.</p>
      <p>You arrange visually, then act on what you already decided.</p>
      <p>Investing finally feels straightforward.</p>
      <article class="order-ticket" aria-label="Illustrative trade log">
        <h3>Monthly instruction log</h3>
        <ul>
          <li data-reveal-item>Month 1 · Buy order · $100</li>
          <li data-reveal-item>Month 1 · Buy order · $100</li>
          <li data-reveal-item>Month 1 · Buy order · $100</li>
        </ul>
      </article>
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

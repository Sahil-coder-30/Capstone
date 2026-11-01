import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Box, Check, ChevronDown, Cloud, Code, Layers, Menu, Moon,
  Play, ShieldCheck, Sun, Volume2, VolumeX, Wrench, X,
} from 'lucide-react';
import './LandingPage.scss';
import BrandLogo from '../../../components/BrandLogo';
import EntryLoader from '../../../components/EntryLoader';
import LandingWorkspace from './LandingWorkspace';
import { useLandingMotion } from '../Hooks/landing.hooks';

const LandingForge3D = lazy(() => import('./LandingForge3D'));

const FILM_HD = '/video/taksha-film-hd.mp4';
const FILM_LIGHT = '/video/taksha-film.mp4';
const FILM_POSTER = '/video/taksha-film-poster.jpg';

// Large screens get the 60fps film. Phones and slow connections keep the lighter copy.
function pickFilm() {
  const { saveData, effectiveType } = navigator.connection ?? {};
  const slow = saveData || ['slow-2g', '2g', '3g'].includes(effectiveType);
  return window.matchMedia('(min-width: 901px)').matches && !slow ? FILM_HD : FILM_LIGHT;
}

function LinkedinIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function GithubIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

// Splits text so GSAP can animate each letter. Screen readers get the h1 aria-label.
function SplitChars({ text }) {
  return text.split(' ').map((word, w) => (
    <span key={`${word}-${w}`} className="split-word" aria-hidden="true">
      {[...word].map((char, c) => <span key={c} className="split-char">{char}</span>)}
    </span>
  )).reduce((all, word, i) => (i === 0 ? [word] : [...all, ' ', word]), []);
}

const NAV_LINKS = [
  { id: 'product', label: 'Product' },
  { id: 'how', label: 'How it works' },
  { id: 'features', label: 'Features' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
];

const FACTS = [
  { icon: ShieldCheck, title: 'You review the plan', text: 'Approve or reject before code starts' },
  { icon: Box, title: 'Your own sandbox', text: 'One Kubernetes pod per project' },
  { icon: Cloud, title: 'Files stay saved', text: 'Workspace syncs to cloud storage' },
  { icon: Check, title: 'Free to start', text: 'No credit card required' },
];

const STATEMENT = 'Most AI tools hand you code and wish you luck. Taksha hands you a running app, with the errors already fixed.';

const STACK = ['Kubernetes', 'LangGraph', 'Mistral Codestral', 'React', 'Vite', 'Monaco Editor', 'xterm.js', 'MongoDB', 'Redis'];

const STAGES = [
  {
    id: 'plan', step: '01', name: 'Plan', agent: 'Planner', icon: Layers,
    headline: 'Splits your prompt into steps. You approve first.',
    desc: 'The Planner pauses before any code is written. Approve the plan, or reject it and say what to change.',
  },
  {
    id: 'build', step: '02', name: 'Build', agent: 'Coder', icon: Code,
    headline: 'Writes every file inside your sandbox.',
    desc: 'Every change lands in the real editor, where you can read it, edit it, or take over.',
  },
  {
    id: 'test', step: '03', name: 'Test', agent: 'Tester', icon: Play,
    headline: 'Runs the app and reads the real errors.',
    desc: 'The Tester runs commands in the sandbox and checks Vite for runtime errors, the same way you would.',
  },
  {
    id: 'fix', step: '04', name: 'Fix', agent: 'Debugger', icon: Wrench,
    headline: 'Patches what broke and tries again.',
    desc: 'The Debugger reads the error, patches the exact lines, and checks again until the app runs clean.',
  },
];

const STAGE_IDS = STAGES.map((stage) => stage.id);

const PLANS = [
  {
    id: 'free', label: 'Free', price: '₹0', cta: 'Start free',
    description: 'Start building with AI. No credit card required.',
    highlights: ['20 AI credits per provider', 'Coding agent + Copilot', '50,000 tokens per day', '0.5 vCPU + 512MB sandbox', 'Community support'],
  },
  {
    id: 'pro', label: 'Pro', price: '₹499', cta: 'Get Pro', popular: true,
    description: 'Full AI power for active developers.',
    highlights: ['4x higher AI usage limits', '5,000,000 tokens per month', '2.0 vCPU + 2GB sandbox', 'All coding and app agents', 'Priority email support'],
  },
  {
    id: 'max', label: 'Max', price: '₹999', cta: 'Get Max',
    description: 'Maximum AI power with flagship models.',
    highlights: ['Unlimited AI tokens', 'Priority queue processing', '4.0 vCPU + 4GB sandbox', 'All flagship AI models', 'Dedicated 24/7 support'],
  },
];

const FAQ = [
  { q: 'What can Taksha build?', a: 'React apps on Vite. Your workspace is a real Node.js environment, so you can open the terminal and install any npm package you need.' },
  { q: 'Do I see the plan before code is written?', a: 'Yes. The agent pauses after planning. You approve the plan, or reject it and say what to change. You can also stop a run at any time.' },
  { q: 'Where does my project run?', a: 'Each project runs in its own Kubernetes pod with CPU and memory limits. Idle sandboxes shut down after about 20 minutes, and your files come back when you start again.' },
  { q: 'Can I code by hand too?', a: 'Yes. You get a Monaco editor and a full terminal next to the agent, so you can edit any file or run any command yourself.' },
  { q: 'How does usage work?', a: 'AI usage is counted in credits, and each plan has its own limits. The Free plan is enough to build your first app, and you can upgrade when you need more.' },
];

function SandboxViz() {
  return (
    <div className="viz-pod" aria-hidden="true">
      <div className="viz-pod__head"><Box size={13} /> sandbox-pod <span>Running</span></div>
      {[['template', 'Vite dev server', ':5173'], ['agent', 'Agent sidecar', ':3000'], ['sync-agent', 'Cloud file sync', 'syncing']].map(([name, role, meta]) => (
        <div key={name} className="viz-pod__row">
          <span className="viz-pod__dot" />
          <code>{name}</code>
          <em>{role}</em>
          <small>{meta}</small>
        </div>
      ))}
    </div>
  );
}

function ReviewViz() {
  return (
    <div className="viz-review" aria-hidden="true">
      <span>Plan ready. 3 steps.</span>
      <div>
        <b className="viz-review__yes"><Check size={12} /> Approve</b>
        <b><X size={12} /> Reject</b>
      </div>
    </div>
  );
}

function TerminalViz() {
  return (
    <div className="viz-term" aria-hidden="true">
      <div><span>$</span> npm i recharts</div>
      <div className="viz-term__muted">added 37 packages</div>
      <div><span>$</span> npm run dev<i /></div>
    </div>
  );
}

function CopilotViz() {
  return (
    <div className="viz-chat" aria-hidden="true">
      <p className="viz-chat__me">Why is this card overflowing?</p>
      <p className="viz-chat__bot">The grid has no min-width. Want me to fix it?</p>
    </div>
  );
}

function SyncViz() {
  return (
    <div className="viz-sync" aria-hidden="true">
      <span>src/App.jsx</span>
      <span>src/TaskItem.jsx</span>
      <span>src/app.scss</span>
      <em><Cloud size={13} /> Saved</em>
    </div>
  );
}

export default function LandingPage({ onNavigateToLogin }) {
  const landingRef = useRef(null);
  const contentRef = useRef(null);
  const filmRef = useRef(null);
  const [filmSrc] = useState(pickFilm);
  const forgeProgressRef = useRef(0);

  const [showLoader, setShowLoader] = useState(() => {
    try {
      return sessionStorage.getItem('taksha_session_loader_v1') !== 'true';
    } catch {
      return true;
    }
  });
  const [introReady,     setIntroReady]     = useState(!showLoader);
  const [activeStage,    setActiveStage]    = useState('plan');
  const [openFaq,        setOpenFaq]        = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [soundOn,        setSoundOn]        = useState(false);
  const [isLight,        setIsLight]        = useState(() => {
    try {
      return localStorage.getItem('theme') === 'light';
    } catch {
      return document.documentElement.classList.contains('light-theme');
    }
  });

  const resetSound = useCallback(() => setSoundOn(false), []);

  const motionRef = useLandingMotion({
    rootRef: landingRef,
    contentRef,
    ready: introReady,
    stageIds: STAGE_IDS,
    onStage: setActiveStage,
    onFilmReset: resetSound,
    forgeProgressRef,
  });

  useEffect(() => { document.title = 'Taksha CodeSpace Studio — Agentic Cloud IDE'; }, []);

  const setFilmSound = useCallback((on) => {
    const film = filmRef.current;
    if (!film) return;
    film.muted = !on;
    setSoundOn(on);
  }, []);

  const handleWatchFilm = useCallback(() => {
    setFilmSound(true);
    motionRef.current.scrollToFilm?.();
  }, [motionRef, setFilmSound]);

  const toggleTheme = useCallback(() => {
    const next = !document.documentElement.classList.contains('light-theme');
    document.documentElement.classList.toggle('light-theme', next);
    try {
      localStorage.setItem('theme', next ? 'light' : 'dark');
    } catch { /* theme still applies for this visit */ }
    setIsLight(next);
  }, []);

  const handleScrollTo = useCallback((e, id) => {
    if (e?.preventDefault) e.preventDefault();
    setMobileMenuOpen(false);
    motionRef.current.scrollTo?.(`#${id}`, -88);
  }, [motionRef]);

  const handleCtaClick = useCallback((e) => {
    if (e?.preventDefault) e.preventDefault();
    if (onNavigateToLogin) onNavigateToLogin();
  }, [onNavigateToLogin]);

  const stage = STAGES.find((s) => s.id === activeStage);

  return (
    <div ref={landingRef} className="lp">
      {showLoader && (
        <EntryLoader
          onExitStart={() => setIntroReady(true)}
          onComplete={() => {
            try {
              sessionStorage.setItem('taksha_session_loader_v1', 'true');
              sessionStorage.setItem('taksha_intro_seen', 'true');
            } catch { /* loader just shows again next visit */ }
            setIntroReady(true);
            setShowLoader(false);
          }}
        />
      )}

      <div className="lp__progress" aria-hidden="true" />

      {/* NAV */}
      <header className="lp__header">
        <a href="#top" className="lp__brand" aria-label="Taksha CodeSpace home" onClick={(e) => { e.preventDefault(); motionRef.current.scrollTo?.('.lp-hero-track'); }}>
          <BrandLogo height={24} />
        </a>
        <nav className="lp__nav-links" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <a key={link.id} href={`#${link.id}`} onClick={(e) => handleScrollTo(e, link.id)}>{link.label}</a>
          ))}
        </nav>
        <div className="lp__nav-cta">
          <button type="button" className="lp__icon-btn" onClick={toggleTheme} aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}>
            {isLight ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button type="button" onClick={handleCtaClick} className="btn btn--ghost btn--sm lp__nav-signin">Sign in</button>
          <button type="button" onClick={handleCtaClick} className="btn btn--primary btn--sm lp__nav-start">Start free</button>
          <button type="button" className="lp__icon-btn lp__hamburger" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation menu">
            <Menu size={16} />
          </button>
        </div>
      </header>

      {/* MOBILE MENU */}
      <div className={`lp__mobile-menu${mobileMenuOpen ? ' lp__mobile-menu--open' : ''}`} role="dialog" aria-modal="true" aria-label="Navigation menu">
        <button type="button" className="lp__icon-btn lp__mobile-menu-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation menu">
          <X size={18} />
        </button>
        {NAV_LINKS.map((link) => (
          <a key={link.id} href={`#${link.id}`} onClick={(e) => handleScrollTo(e, link.id)}>{link.label}</a>
        ))}
        <button type="button" onClick={handleCtaClick} className="btn btn--primary btn--lg">
          Start free <ArrowRight size={15} />
        </button>
      </div>

      <div ref={contentRef} className="lp__content">
        {/* HERO: headline first, a small scroll fades in the film, then the curtain */}
        <div className="lp-hero-track">
          <section className="lp-hero">
            <div className="lp-hero__bg" aria-hidden="true" />

            <div className="lp-hero__media">
              <video ref={filmRef} className="lp-video" src={filmSrc} poster={FILM_POSTER} muted loop playsInline preload="auto" />
            </div>

            <div className="lp-hero__copy">
              <h1 className="lp-hero__title" aria-label="Describe your app. Taksha builds, tests and heals it.">
                <span className="lp-hero__line"><SplitChars text="Describe your app." /></span>
                <span className="lp-hero__line lp-hero__line--accent"><SplitChars text="Taksha builds, tests & heals it." /></span>
              </h1>
              <p className="lp-hero__sub" data-intro>
                Write one prompt and approve the plan. Agents write the code, run it in your own cloud sandbox, and fix their own errors until the app is live.
              </p>
              <div className="lp-hero__actions" data-intro>
                <button type="button" onClick={handleCtaClick} className="btn btn--primary btn--lg magnetic">
                  Start building free <ArrowRight size={15} />
                </button>
                <button type="button" onClick={handleWatchFilm} className="btn btn--ghost btn--lg magnetic">
                  <Play size={15} /> Watch the film
                </button>
              </div>
              <p className="lp-hero__note" data-intro>Free plan. No credit card required.</p>
            </div>

            <button type="button" className="lp-hero__watch" onClick={() => setFilmSound(!soundOn)}>
              {soundOn ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {soundOn ? 'Mute' : 'Turn sound on'}
            </button>

            <div className="lp-hero__cue" aria-hidden="true"><span /></div>
          </section>
        </div>

        {/* PRODUCT: slides over the hero like a curtain */}
        <section id="product" className="lp-product">
          <div className="lp__container">
            <header className="lp__head lp__head--center" data-rise>
              <p className="lp__eyebrow">The real workspace</p>
              <h2>This is where the work happens.</h2>
            </header>
            <div className="lp-product__stage">
              <LandingWorkspace isLight={isLight} />
            </div>
            <div className="lp-facts">
              {FACTS.map((fact, i) => {
                const Icon = fact.icon;
                return (
                  <div key={fact.title} className="lp-fact" data-rise={i}>
                    <span className="lp-fact__icon"><Icon size={16} /></span>
                    <div>
                      <strong>{fact.title}</strong>
                      <span>{fact.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* KINETIC STATEMENT */}
        <section className="lp-statement">
          <p className="lp__container">
            {STATEMENT.split(' ').map((word, i) => (
              <span key={`${word}-${i}`} className="split-word-plain">{word} </span>
            ))}
          </p>
        </section>

        {/* FORGE: pinned 3D, scroll moves through the four stages */}
        <div id="how" className="lp-forge-track">
          <section className="lp-forge">
            <div className="lp-forge__stars" aria-hidden="true" />
            <Suspense fallback={<div className="lp-forge__canvas" />}>
              <LandingForge3D progressRef={forgeProgressRef} stage={activeStage} />
            </Suspense>

            <div className="lp-forge__layout">
              <div className="lp-forge__copy" key={stage.id}>
                <p className="lp__eyebrow">{stage.step} / {stage.agent}</p>
                <h2>{stage.headline}</h2>
                <p>{stage.desc}</p>
              </div>
            </div>

            <ol className="lp-forge__list">
              {STAGES.map((item) => (
                <li key={item.id}>
                  <p className="lp__eyebrow">{item.step} / {item.agent}</p>
                  <h2>{item.headline}</h2>
                  <p>{item.desc}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* STACK MARQUEE */}
        <section className="lp-marquee" aria-label="Built on">
          <div className="lp-marquee__track">
            {[0, 1].map((copy) => (
              <div key={copy} className="lp-marquee__group" aria-hidden={copy === 1}>
                {STACK.map((item) => <span key={item}>{item}</span>)}
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="lp__section">
          <div className="lp__container">
            <header className="lp__head" data-rise>
              <p className="lp__eyebrow">Features</p>
              <h2>A full IDE, not a chat box</h2>
              <p>The agent does the heavy work. You keep the editor, the terminal, and the final say.</p>
            </header>

            <div className="bento">
              <div className="bento__slot bento__slot--wide" data-rise>
                <article className="bento__cell tilt">
                  <h3>A real sandbox for every project</h3>
                  <p>Your app runs in its own Kubernetes pod with a live Vite server, so the preview is the real thing.</p>
                  <SandboxViz />
                </article>
              </div>
              <div className="bento__slot" data-rise="1">
                <article className="bento__cell tilt">
                  <h3>You stay in control</h3>
                  <p>Approve or reject the plan, and stop a run at any time.</p>
                  <ReviewViz />
                </article>
              </div>
              <div className="bento__slot" data-rise="0">
                <article className="bento__cell tilt">
                  <h3>Editor and terminal</h3>
                  <p>Monaco and a full terminal sit right next to the agent.</p>
                  <TerminalViz />
                </article>
              </div>
              <div className="bento__slot" data-rise="1">
                <article className="bento__cell tilt">
                  <h3>A copilot at your side</h3>
                  <p>Ask Clio quick questions while you work on your project.</p>
                  <CopilotViz />
                </article>
              </div>
              <div className="bento__slot" data-rise="2">
                <article className="bento__cell tilt">
                  <h3>Your files stay safe</h3>
                  <p>Files sync to cloud storage and return when you restart.</p>
                  <SyncViz />
                </article>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="lp__section">
          <div className="lp__container">
            <header className="lp__head lp__head--center" data-rise>
              <p className="lp__eyebrow">Pricing</p>
              <h2>Start free. Upgrade when you ship.</h2>
              <p>Every plan includes the coding agent, your own workspace, and a live preview.</p>
            </header>

            <div className="plans">
              {PLANS.map((plan, i) => (
                <div key={plan.id} className="plans__slot" data-rise={i}>
                  <article className={`plan tilt${plan.popular ? ' plan--popular' : ''}`}>
                    <div className="plan__top">
                      <h3>{plan.label}</h3>
                      {plan.popular && <span className="plan__tag">Most popular</span>}
                    </div>
                    <p className="plan__desc">{plan.description}</p>
                    <p className="plan__price"><strong>{plan.price}</strong> <span>per month</span></p>
                    <button
                      type="button"
                      onClick={handleCtaClick}
                      className={`btn btn--md ${plan.popular ? 'btn--primary' : 'btn--ghost'}`}
                    >
                      {plan.cta} <ArrowRight size={14} />
                    </button>
                    <ul>
                      {plan.highlights.map((item) => (
                        <li key={item}><Check size={14} /> {item}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="lp__section">
          <div className="lp__container lp__faq">
            <header className="lp__head" data-rise>
              <p className="lp__eyebrow">FAQ</p>
              <h2>Common questions</h2>
            </header>
            <div className="faq-list" data-rise="1">
              {FAQ.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div key={item.q} className={`faq-item${open ? ' faq-item--open' : ''}`}>
                    <button type="button" className="faq-item__q" aria-expanded={open} onClick={() => setOpenFaq(open ? null : i)}>
                      {item.q}
                      <ChevronDown size={16} />
                    </button>
                    <div className="faq-item__a"><div><p>{item.a}</p></div></div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FOOTER: the closing moment. The wordmark is forged on scroll and reacts to the cursor. */}
        <footer className="lp-footer">
          <div className="lp-footer__glow" aria-hidden="true" />
          <canvas className="lp-footer__sparks" aria-hidden="true" />

          <div className="lp-footer__top">
            <div className="lp-footer__cta">
              <h2 className="lp-kinetic" aria-label="Your next app is one prompt away.">
                <SplitChars text="Your next app is" />{' '}
                <span className="lp-footer__accent"><SplitChars text="one prompt" /></span>{' '}
                <SplitChars text="away." />
                <span className="lp-footer__caret" aria-hidden="true" />
              </h2>
              <button type="button" onClick={handleCtaClick} className="btn btn--primary btn--lg magnetic">
                Start building free <ArrowRight size={15} />
              </button>
            </div>

            <nav className="lp-footer__nav" aria-label="Footer">
              {NAV_LINKS.map((link) => (
                <a key={link.id} href={`#${link.id}`} onClick={(e) => handleScrollTo(e, link.id)}>{link.label}</a>
              ))}
            </nav>

            <div className="lp-footer__nav">
              <a href="https://www.linkedin.com/in/sahil-sharma-1a024b330/" target="_blank" rel="noreferrer"><LinkedinIcon size={15} /> LinkedIn</a>
              <a href="https://github.com/Sahil-coder-30" target="_blank" rel="noreferrer"><GithubIcon size={15} /> GitHub</a>
            </div>
          </div>

          <div className="lp-footer__word" aria-hidden="true">
            {[...'TAKSHA'].map((letter, i) => (
              <span key={i} className="lp-letter">
                <span className="lp-letter__body">
                  <span className="lp-letter__glow">{letter}</span>
                  <span className="lp-letter__face">{letter}</span>
                </span>
              </span>
            ))}
          </div>
          <div className="lp-footer__ember" aria-hidden="true" />

          <div className="lp-footer__bar">
            <span>© {new Date().getFullYear()} Taksha CodeSpace Studio</span>
            <span>Built by Sahil Sharma</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

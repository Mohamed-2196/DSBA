// Seed threads for the forum (deterministic: no randomness, times relative to Date.now()).
// `ago` is minutes before page load, so the film (clock frozen at 2026-10-06 10:00 Bahrain) and
// any other day read the same: "2h ago", "1d ago"... Reply ids are local to the thread
// ('a', 'b', nested 'a1') and become '<threadId>:<local>' at runtime. One level of nesting.
// Bodies use the forum's small markdown: **bold**, *italic*, `code`, ``` blocks, - and 1. lists, > quotes, [links](/path).
// Content rules: only module codes that exist in src/data, exam dates from src/data/calendar.js,
// authors are dummy students, never real tutors or staff.

const m = (n) => n;
const h = (n) => n * 60;
const d = (n, hours = 0) => n * 1440 + hours * 60;

/** Trim the common indentation of a template literal so bodies can be written indented. */
function md(strings, ...values) {
  const raw = strings.reduce((acc, s, i) => acc + s + (i < values.length ? values[i] : ''), '');
  const lines = raw.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

/** The easter-egg thread (General). Innocent to a tutor; students know what today is. */
export const EASTER_EGG_ID = 'why-is-everyone-acting-weird-today';

export const SEED_THREADS = [
  // ── Pinned ────────────────────────────────────────────────────────────────────────────────
  {
    id: 'welcome-to-the-forum',
    category: 'general',
    moduleId: null,
    pinned: true,
    title: 'Welcome to the forum: read this before you post',
    author: 'hub',
    ago: d(12),
    votes: 64,
    tags: [],
    body: md`
      This forum is for DSBA students in every year. Ask questions, share what worked for you and find people to revise with.

      **A few house rules**

      - Search first. Your question may already have an answer.
      - Put the module code in your title when there is one, like ST2133 or MT1186.
      - One question per thread, with what you've tried so far.
      - When an answer solves your problem, accept it so the next person finds it quickly.
      - Be kind. Everyone here is revising too.
      - Never post exam questions or answers while an exam window is open.

      The forum is run by students. It isn't monitored by BIBF or the University of London, so check anything official (exam rules, deadlines, regulations) on the VLE, MyClass or the student portal.
    `,
    replies: [
      { id: 'a', author: 'fatima-a', ago: d(11, 6), votes: 12, body: 'Thank you for setting this up! So much easier than scrolling through five group chats.' },
      {
        id: 'b', author: 'sayed-ali-m', ago: d(11, 2), votes: 9, body: 'Could we get a place for internship and job posts too?',
        replies: [
          { id: 'b1', author: 'hub', ago: d(10, 20), votes: 6, body: "Good idea. Post them in General for now and we'll add a category once there's enough interest." },
        ],
      },
    ],
  },

  // ── Year 2 ────────────────────────────────────────────────────────────────────────────────
  {
    id: 'mgf-of-a-gamma-distribution',
    category: 'year-2',
    moduleId: 'advanced-stats-distribution',
    title: 'How do I find the MGF of a Gamma(α, λ) distribution?',
    author: 'ebrahim-d',
    ago: m(130),
    votes: 24,
    tags: ['exam-prep'],
    accepted: 'a',
    body: md`
      I keep getting stuck at the integral step. I set it up like this:

      \`\`\`
      M(t) = E[e^(tX)]
           = ∫ e^(tx) λ^α x^(α−1) e^(−λx) / Γ(α) dx    (x from 0 to ∞)
      \`\`\`

      and then I don't know how to get rid of the integral. Do I need integration by parts α times?
    `,
    replies: [
      {
        id: 'a', author: 'noor-e', ago: m(112), votes: 31,
        body: md`
          No integration by parts needed. Combine the exponentials first:

          \`e^(tx) e^(−λx) = e^(−(λ−t)x)\`

          Now the integrand looks like a Gamma(α, λ−t) pdf without its constant. Multiply and divide by (λ−t)^α, and use the fact that a pdf integrates to 1:

          \`\`\`
          M(t) = λ^α / (λ−t)^α = (λ / (λ−t))^α,   for t < λ
          \`\`\`
        `,
        replies: [
          { id: 'a1', author: 'ebrahim-d', ago: m(104), votes: 6, body: 'The "make it look like a pdf" trick. That just saved me an hour, thank you!' },
          { id: 'a2', author: 'yusuf-b', ago: m(71), votes: 4, body: 'So the exponential is just the α = 1 case: `λ / (λ−t)`. Nice.' },
        ],
      },
      { id: 'b', author: 'ali-h', ago: m(98), votes: 12, body: 'Same trick works for the normal and the beta. Whenever an integral looks like a pdf, make it one.' },
      { id: 'c', author: 'zainab-k', ago: m(83), votes: 9, body: "Write the condition **t < λ** in your answer, otherwise the integral doesn't converge. Easy mark to lose." },
      {
        id: 'd', author: 'reem-a', ago: m(37), votes: 3, body: 'Is there a list of which MGFs we need to know by heart?',
        replies: [
          { id: 'd1', author: 'noor-e', ago: m(22), votes: 2, body: 'Bernoulli, binomial, Poisson, geometric, exponential, gamma and normal. Derive the rest when you need them.' },
        ],
      },
    ],
  },
  {
    id: 'surviving-st2133-distribution-theory',
    category: 'year-2',
    moduleId: 'advanced-stats-distribution',
    title: 'Surviving ST2133: how are you revising for Distribution Theory?',
    author: 'zainab-k',
    ago: h(26),
    votes: 41,
    tags: ['exam-prep'],
    body: md`
      The exam is on 30 October and I still feel shaky on transformations and MGFs. What's working for you?

      So far I'm doing one past paper every two days and redoing the chapter 2 exercises without looking at the solutions. It helps, but slowly.
    `,
    replies: [
      {
        id: 'a', author: 'ali-h', ago: h(25), votes: 29,
        body: md`
          Past papers first, theory second. Most questions are variations of the same few patterns:

          - The CDF method for a function of one variable
          - Transformations with the Jacobian
          - MGFs to identify a distribution
          - Conditional expectation and variance
          - The bivariate normal

          Get fast at each one and the rest is practice.
        `,
        replies: [
          { id: 'a1', author: 'zainab-k', ago: h(24), votes: 8, body: "This list is gold, thank you. I'd add order statistics, they came up in two of the papers I did." },
        ],
      },
      { id: 'b', author: 'noor-e', ago: h(22), votes: 17, body: 'Make your own one-page sheet with every distribution: pdf, mean, variance and MGF. Writing it out yourself sticks better than downloading one.' },
      { id: 'c', author: 'yusuf-b', ago: h(20), votes: 6, body: 'Watch the chapter 2 videos at 1.5x, then redo the worked examples with the video paused before each step. Slow, but it works.' },
      {
        id: 'd', author: 'reem-a', ago: h(9), votes: 4, body: 'Anyone want to do a timed paper together this weekend?',
        replies: [
          { id: 'd1', author: 'noor-e', ago: h(8), votes: 5, body: "Yes! Join the [Thursday study group](/forum/st2133-study-group-thursdays) too, we're doing one paper a week until the exam." },
        ],
      },
    ],
  },
  {
    id: 'r-or-python-for-st2195-coursework',
    category: 'year-2',
    moduleId: 'programming-data-science',
    title: 'R or Python for the ST2195 coursework?',
    author: 'yusuf-b',
    ago: d(2, 3),
    votes: 33,
    tags: ['coursework', 'r', 'python'],
    body: md`
      The coursework lets us use either. I'm more comfortable with Python and pandas, but a lot of the course blocks lean on R for the statistics parts.

      If you did it last year: did one language make the report easier?
    `,
    replies: [
      {
        id: 'a', author: 'sayed-ali-m', ago: d(2, 1), votes: 22, body: "Did it last year in R. The part that took the longest was cleaning the data, not the language. Start with block 6 on data wrangling if you haven't yet.",
        replies: [{ id: 'a1', author: 'yusuf-b', ago: d(2), votes: 3, body: 'Block 6 it is. Thanks!' }],
      },
      { id: 'b', author: 'ali-h', ago: d(1, 21), votes: 15, body: 'R with tidyverse and ggplot here. The plots looked good with very little effort, and R Markdown made the report part painless.' },
      { id: 'c', author: 'zainab-k', ago: d(1, 16), votes: 11, body: 'Python with a Jupyter notebook was completely fine for me. Pick the one you can debug at 2am.' },
      { id: 'd', author: 'noor-e', ago: d(1, 1), votes: 14, body: 'Whatever you pick, make it reproducible: set a seed, never edit the raw data by hand, and check the script runs top to bottom in a fresh session.' },
      { id: 'e', author: 'hussain-m', ago: h(10), votes: 7, body: 'You can also mix them: wrangle in Python, model in R. Just explain the choice in the report.' },
    ],
  },
  {
    id: 'st2134-mle-vs-method-of-moments',
    category: 'year-2',
    moduleId: 'advanced-stats-inferential',
    title: 'ST2134: when do MLE and method of moments give the same estimator?',
    author: 'noor-e',
    ago: m(48),
    votes: 9,
    tags: ['exam-prep'],
    body: md`
      For the exponential and the Poisson they come out the same, but for the uniform on [0, θ] they're different (2X̄ against the sample maximum).

      Is there a rule for when they match, or do I just have to work it out each time?
    `,
    replies: [],
  },
  {
    id: 'st2187-solver-missing-excel-mac',
    category: 'year-2',
    moduleId: 'business-analytics',
    title: 'ST2187: Solver is missing in Excel on my Mac',
    author: 'ebrahim-d',
    ago: h(6),
    votes: 7,
    tags: ['excel'],
    accepted: 'a',
    body: "Block 14 on optimisation models needs Solver, but I can't find it anywhere in Excel for Mac. Any ideas?",
    replies: [
      { id: 'a', author: 'ali-h', ago: m(331), votes: 10, body: 'Go to **Tools > Excel Add-ins**, tick **Solver Add-in** and press OK. It then shows up at the right end of the **Data** tab.' },
      {
        id: 'b', author: 'yusuf-b', ago: m(318), votes: 3, body: "If it still doesn't appear, quit Excel completely and open it again. Mine needed that.",
        replies: [{ id: 'b1', author: 'ebrahim-d', ago: m(296), votes: 1, body: 'Worked after a restart. Thanks both!' }],
      },
    ],
  },
  {
    id: 'is2184-topics-that-come-up-most',
    category: 'year-2',
    moduleId: 'information-systems',
    title: 'IS2184: which topics come up most in past papers?',
    author: 'zainab-k',
    ago: h(23),
    votes: 13,
    tags: ['past-papers'],
    body: 'Going through past papers, it feels like IT strategy, outsourcing and ERP systems come up every year. Has anyone made a list?',
    replies: [
      { id: 'a', author: 'noor-e', ago: h(21), votes: 8, body: 'Add information security and the business value of IT. Both show up a lot in the essay questions.' },
      { id: 'b', author: 'ali-h', ago: h(16), votes: 6, body: "I'm putting together a table of topics against years. I'll post it here by Thursday." },
    ],
  },
  {
    id: 'ec2020-robust-standard-errors-in-r',
    category: 'year-2',
    moduleId: 'econometrics',
    title: 'EC2020: how do I get robust standard errors in R?',
    author: 'reem-a',
    ago: h(14),
    votes: 16,
    tags: ['r'],
    accepted: 'a',
    body: "The heteroskedasticity chapter says to use White's robust standard errors. How do I get them in R after `lm()`?",
    replies: [
      {
        id: 'a', author: 'yusuf-b', ago: h(13), votes: 14,
        body: md`
          Use the sandwich and lmtest packages:

          \`\`\`r
          library(sandwich)
          library(lmtest)

          model <- lm(wage ~ educ + exper, data = wages)
          coeftest(model, vcov = vcovHC(model, type = "HC1"))
          \`\`\`

          HC1 is the same correction Stata uses with the robust option, in case you're comparing outputs.
        `,
      },
      {
        id: 'b', author: 'hussain-m', ago: h(10), votes: 5, body: 'Also run `bptest(model)` first, so you show there is heteroskedasticity before you correct for it.',
        replies: [{ id: 'b1', author: 'reem-a', ago: h(9), votes: 2, body: 'Perfect, both worked. Thank you!' }],
      },
    ],
  },

  // ── Year 1 ────────────────────────────────────────────────────────────────────────────────
  {
    id: 'mt1186-past-paper-solutions',
    category: 'year-1',
    moduleId: 'mathematics',
    title: "MT1186 past paper solutions: let's build them together",
    author: 'hawra-t',
    ago: d(4),
    votes: 52,
    tags: ['past-papers'],
    body: md`
      Most past papers don't come with worked solutions, so let's split them up.

      1. Reply with the paper and the questions you're taking, so nobody does the same one twice.
      2. Post your solution as a reply to your own comment.
      3. Check each other's work and upvote the solutions you've verified.

      The exam is on 22 October, so let's aim to finish the last three years by the 15th.
    `,
    replies: [
      {
        id: 'a', author: 'ahmed-j', ago: d(3, 23), votes: 14, body: 'Taking the most recent Zone A paper, questions 1 to 3.',
        replies: [
          { id: 'a1', author: 'ahmed-j', ago: d(3), votes: 19, body: 'Questions 1 to 3 are done. Question 2 is the tricky one: check the second-order conditions before you call it a maximum. I almost lost that mark.' },
        ],
      },
      { id: 'b', author: 'fatima-a', ago: d(3, 21), votes: 11, body: "I'll do the Lagrange multiplier question on the Zone B paper." },
      {
        id: 'c', author: 'jassim-k', ago: d(3, 15), votes: 8, body: "There's a difference equations question on every paper I've seen. I'll collect all of them in one post.",
        replies: [{ id: 'c1', author: 'layla-f', ago: d(3, 13), votes: 6, body: "Yes please, those are the ones I'm worst at." }],
      },
      {
        id: 'd', author: 'hawra-t', ago: d(2, 2), votes: 9, body: 'Progress so far: two papers fully done. Who wants the oldest one?',
        replies: [{ id: 'd1', author: 'layla-f', ago: d(2), votes: 4, body: 'Me, starting tonight.' }],
      },
      { id: 'e', author: 'jassim-k', ago: h(30), votes: 21, body: "Done: every difference equations question from the last five papers, with full solutions. If you find a mistake, reply here and I'll fix it." },
    ],
  },
  {
    id: 'st1215-p-value-or-critical-value',
    category: 'year-1',
    moduleId: 'statistics',
    title: 'ST1215: p-value or critical value, which one should I use in the exam?',
    author: 'layla-f',
    ago: h(9),
    votes: 15,
    tags: ['exam-prep'],
    accepted: 'a',
    body: 'In the hypothesis testing chapter some examples use a critical value and others a p-value. Do we get full marks with either approach?',
    replies: [
      {
        id: 'a', author: 'ahmed-j', ago: m(500), votes: 13,
        body: md`
          Either is fine, as long as every step is there:

          1. H₀ and H₁
          2. The test statistic and its distribution under H₀
          3. The decision: reject H₀ or not
          4. A conclusion in words, in the context of the question

          The last step is where most people lose marks.
        `,
      },
      { id: 'b', author: 'fatima-a', ago: m(450), votes: 6, body: 'If the question asks for one method, use that one. Otherwise pick one and be consistent.' },
      { id: 'c', author: 'hawra-t', ago: m(200), votes: 3, body: 'Critical values are faster when all you have is the tables.' },
    ],
  },
  {
    id: 'st1215-formula-sheet-in-the-exam',
    category: 'year-1',
    moduleId: 'statistics',
    title: 'ST1215: do we get a formula sheet in the exam, or do we memorise everything?',
    author: 'khalid-n',
    ago: m(76),
    votes: 5,
    tags: ['exams'],
    body: "First time doing a UoL exam. For the October ST1215 paper, are the formulas and statistical tables given, or should I be memorising the distributions too?",
    replies: [],
  },
  {
    id: 'ec1002-how-many-diagrams',
    category: 'year-1',
    moduleId: 'economics',
    title: 'EC1002: how many diagrams should an elasticity answer have?',
    author: 'ahmed-j',
    ago: d(2, 5),
    votes: 11,
    tags: ['exam-prep'],
    body: 'For the long questions, is one diagram enough, or should I draw one for each case (elastic and inelastic)?',
    replies: [
      { id: 'a', author: 'fatima-a', ago: d(2, 4), votes: 8, body: 'Draw what you explain. If you compare two cases, use two diagrams and label both.' },
      { id: 'b', author: 'layla-f', ago: d(1, 18), votes: 5, body: 'Label the axes and the curves every single time. Free marks.' },
      { id: 'c', author: 'hawra-t', ago: h(23), votes: 3, body: 'Practise drawing them quickly. Time is the real problem in that paper.' },
    ],
  },
  {
    id: 'mn1178-case-study-structure',
    category: 'year-1',
    moduleId: 'business',
    title: 'MN1178: how do you structure the case study answer?',
    author: 'jassim-k',
    ago: h(30),
    votes: 10,
    tags: ['exam-prep'],
    body: 'I write a lot for the case study question, but my mock marks were average. How do you structure your answer?',
    replies: [
      {
        id: 'a', author: 'hawra-t', ago: h(28), votes: 9,
        body: md`
          What worked for me:

          1. One line on the issue in the case
          2. The framework you're using, briefly
          3. Apply it to the company, with evidence from the case
          4. A clear recommendation at the end

          Less theory, more of the case.
        `,
      },
      { id: 'b', author: 'ahmed-j', ago: h(16), votes: 4, body: "Use the company's name in every paragraph. It forces you to apply the theory instead of just describing it." },
    ],
  },

  // ── Year 3 ────────────────────────────────────────────────────────────────────────────────
  {
    id: 'is-machine-learning-as-hard-as-people-say',
    category: 'year-3',
    moduleId: 'machine-learning',
    title: 'Is Machine Learning as hard as people say?',
    author: 'reem-a',
    ago: h(20),
    votes: 47,
    tags: ['module-choice'],
    accepted: 'b',
    body: md`
      I'm choosing my Year 3 modules soon and everyone says ML is the hardest one. Is it the maths, the amount of content or the exam style?

      Honest answers from people taking it now would really help.
    `,
    replies: [
      { id: 'a', author: 'hussain-m', ago: m(1150), votes: 24, body: "It's not hard, it's wide. Every week is a new method. If you were fine with ST2133 and matrices, you'll be fine." },
      {
        id: 'b', author: 'sara-m', ago: m(1100), votes: 38,
        body: md`
          The maths is mostly linear algebra and probability you already know. What's hard is explaining in words why a method works and when it fails, and the exam asks for that a lot.

          What helped me:

          - A one-paragraph summary of each method: what it optimises, its assumptions, when it overfits
          - Coding each method once, even badly. It makes the theory click
          - A running list of trade-offs: bias and variance, interpretability, speed
        `,
      },
      { id: 'c', author: 'sayed-ali-m', ago: m(900), votes: 15, body: 'Start the programming part early. Everything else gets easier after that.' },
      {
        id: 'd', author: 'abdulla-r', ago: m(700), votes: 12, body: "Honestly it's my favourite module. Hard, but fair.",
        replies: [{ id: 'd1', author: 'reem-a', ago: m(650), votes: 5, body: 'This is really reassuring, thank you all.' }],
      },
      { id: 'e', author: 'ali-h', ago: m(300), votes: 3, body: 'Following. Same decision coming up for me.' },
    ],
  },
  {
    id: 'asset-pricing-formula-sheet',
    category: 'year-3',
    moduleId: 'asset-pricing',
    title: 'Asset Pricing formula sheet: CAPM, APT, bonds and options',
    author: 'sara-m',
    ago: d(3, 2),
    votes: 44,
    tags: ['formula-sheet'],
    body: md`
      I made a formula sheet while revising. Posting the main formulas here first so people can check them before I share the full PDF.

      \`\`\`
      CAPM             E[R_i] = R_f + β_i (E[R_m] − R_f)
      Beta             β_i = Cov(R_i, R_m) / Var(R_m)
      Sharpe ratio     S = (E[R_p] − R_f) / σ_p
      Bond price       P = Σ C / (1 + y)^t + F / (1 + y)^T
      Put-call parity  C − P = S₀ − K e^(−rT)
      \`\`\`

      Tell me if you spot a mistake and I'll fix it.
    `,
    replies: [
      {
        id: 'a', author: 'abdulla-r', ago: d(3), votes: 16, body: 'Really useful. Could you put Macaulay and modified duration side by side? People mix them up all the time.',
        replies: [{ id: 'a1', author: 'sara-m', ago: d(2, 22), votes: 9, body: 'Good call, added: `modified duration = Macaulay duration / (1 + y)`.' }],
      },
      { id: 'b', author: 'hussain-m', ago: d(2, 17), votes: 7, body: 'Exactly what I needed this week, thank you!' },
      {
        id: 'c', author: 'sayed-ali-m', ago: d(1, 9), votes: 5, body: 'Does it include the Black–Scholes assumptions?',
        replies: [{ id: 'c1', author: 'sara-m', ago: d(1, 7), votes: 6, body: "The assumptions only, no derivation. They're on page 2 of the PDF." }],
      },
    ],
  },
  {
    id: 'marketing-management-is-4ps-enough',
    category: 'year-3',
    moduleId: 'marketing-management',
    title: 'Marketing Management: is the 4Ps enough for the essay questions?',
    author: 'abdulla-r',
    ago: h(5),
    votes: 4,
    tags: ['exam-prep'],
    body: 'For the essays, is it enough to structure everything around the 4Ps, or do they expect the extended 7Ps and a proper segmentation and targeting discussion too?',
    replies: [],
  },
  {
    id: 'market-research-sample-size-proportion',
    category: 'year-3',
    moduleId: 'market-research',
    title: 'Market research: sample size for estimating a proportion',
    author: 'abdulla-r',
    ago: d(2, 7),
    votes: 8,
    tags: ['exam-prep'],
    accepted: 'a',
    body: "For a 95% confidence interval with a 3% margin of error, do we always use p = 0.5 when we don't know p?",
    replies: [
      {
        id: 'a', author: 'sara-m', ago: d(2, 6), votes: 11,
        body: md`
          Yes. p = 0.5 maximises p(1 − p), so it's the safe choice:

          \`n = 1.96² × 0.5 × 0.5 / 0.03² ≈ 1067.1\`, so round up to 1,068.

          If a pilot study gives you an estimate of p, use that instead and you'll need a smaller sample.
        `,
      },
      { id: 'b', author: 'hussain-m', ago: d(1, 10), votes: 3, body: 'And always round up, not to the nearest whole number. I lost a mark for that once.' },
    ],
  },
  {
    id: 'further-maths-kuhn-tucker-intuition',
    category: 'year-3',
    moduleId: 'further-maths-economists',
    title: 'Further Maths: any intuition for the Kuhn–Tucker conditions?',
    author: 'hussain-m',
    ago: h(31),
    votes: 12,
    tags: ['exam-prep'],
    accepted: 'a',
    body: "I can apply the conditions mechanically, but I don't get why complementary slackness works. Any good way to think about it?",
    replies: [
      { id: 'a', author: 'sayed-ali-m', ago: h(30), votes: 17, body: "Think of the multiplier as the price of the constraint. If the constraint isn't binding, relaxing it is worth nothing, so its price is 0. If the price is positive, the constraint must be binding. That's complementary slackness: `λ × slack = 0`." },
      { id: 'b', author: 'abdulla-r', ago: h(25), votes: 6, body: 'Draw the two-variable case. When the optimum is inside the feasible region the constraint does nothing, and the picture makes it obvious.' },
      { id: 'c', author: 'sara-m', ago: h(17), votes: 3, body: "Then check the corner cases. That's where exam questions like to hide." },
    ],
  },

  // ── Study groups ──────────────────────────────────────────────────────────────────────────
  {
    id: 'econometrics-study-group-saturday',
    category: 'study-groups',
    moduleId: 'econometrics',
    title: 'Econometrics study group this Saturday at the library',
    author: 'ali-h',
    ago: m(150),
    votes: 26,
    tags: [],
    body: md`
      Booking a room at the library for **Saturday, 10:00 to 13:00**.

      The plan:

      - Chapters 4 to 6: inference, OLS asymptotics and heteroskedasticity
      - One past paper under timed conditions
      - 30 minutes to go through the answers together

      Reply if you're coming so I can book the right room size.
    `,
    replies: [
      { id: 'a', author: 'noor-e', ago: m(141), votes: 7, body: "I'm in. I'll bring printed copies of a past paper so we don't need laptops." },
      {
        id: 'b', author: 'zainab-k', ago: m(128), votes: 5, body: "Coming! Can we start with heteroskedasticity? I'm lost there.",
        replies: [{ id: 'b1', author: 'ali-h', ago: m(119), votes: 3, body: "Sure, we'll do chapter 6 first." }],
      },
      { id: 'c', author: 'yusuf-b', ago: m(96), votes: 2, body: "In, but I'll be 30 minutes late." },
      { id: 'd', author: 'reem-a', ago: m(74), votes: 2, body: 'Count me in.' },
      { id: 'e', author: 'ali-h', ago: m(33), votes: 6, body: "That's six of us, so I've booked the bigger room. See you Saturday!" },
    ],
  },
  {
    id: 'st2133-study-group-thursdays',
    category: 'study-groups',
    moduleId: 'advanced-stats-distribution',
    title: 'ST2133 study group: online every Thursday at 8pm',
    author: 'noor-e',
    ago: d(2, 2),
    votes: 21,
    tags: ['past-papers'],
    body: md`
      We're going through one past paper a week until the exam on 30 October. Everyone takes one question and presents it on a shared screen, then we go through the rest together.

      The meeting link goes out in this thread on the morning of each session.
    `,
    replies: [
      { id: 'a', author: 'zainab-k', ago: d(2, 1), votes: 6, body: 'Joining!' },
      {
        id: 'b', author: 'reem-a', ago: d(1, 22), votes: 4, body: "Could we record the sessions for people who can't make it?",
        replies: [{ id: 'b1', author: 'noor-e', ago: d(1, 20), votes: 5, body: "If everyone's fine with it, yes. I'll ask at the start of the next session." }],
      },
      { id: 'c', author: 'ebrahim-d', ago: h(20), votes: 3, body: 'Count me in from this week.' },
    ],
  },
  {
    id: 'year-1-maths-revision-group',
    category: 'study-groups',
    moduleId: 'mathematics',
    title: 'Year 1 maths revision group: integration and optimisation',
    author: 'fatima-a',
    ago: h(11),
    votes: 14,
    tags: [],
    body: 'Starting a small group for MT1186 before the exam on 22 October: Mondays and Wednesdays after class, on campus. First session is integration techniques, then one and two-variable optimisation.',
    replies: [
      { id: 'a', author: 'layla-f', ago: h(10), votes: 4, body: 'Yes please! Integration by parts is my nemesis.' },
      { id: 'b', author: 'jassim-k', ago: h(8), votes: 3, body: "I'll join on Wednesdays." },
      { id: 'c', author: 'hawra-t', ago: h(5), votes: 2, body: 'In. Can we do difference equations one day too?' },
    ],
  },

  // ── General ───────────────────────────────────────────────────────────────────────────────
  {
    id: 'calculators-allowed-in-october-exams',
    category: 'general',
    moduleId: null,
    title: 'Which calculators are allowed in the October exams?',
    author: 'fatima-a',
    ago: h(27),
    votes: 38,
    tags: ['exams', 'calculators'],
    accepted: 'a',
    body: "I have a Casio fx-991EX. Is it allowed in the October exams, or do we need a specific model? I can't find a clear list anywhere.",
    replies: [
      {
        id: 'a', author: 'sayed-ali-m', ago: h(26), votes: 27,
        body: md`
          The calculator rules are in the exam regulations on the UoL student portal. As far as I know they're about features rather than one approved model: no programmable, graph-drawing or text-storing calculators.

          Check your exact model against the portal before exam day, not on the morning of the exam.
        `,
      },
      { id: 'b', author: 'jassim-k', ago: h(25), votes: 9, body: 'Also bring a spare battery, or a second calculator if you have one.' },
      {
        id: 'c', author: 'layla-f', ago: h(22), votes: 4, body: "If ours isn't allowed, do they give us one in the exam room?",
        replies: [{ id: 'c1', author: 'sayed-ali-m', ago: h(21), votes: 8, body: "I wouldn't count on it. Ask the exams office this week so you have time to buy one." }],
      },
      { id: 'd', author: 'ahmed-j', ago: h(15), votes: 2, body: 'Thanks for asking this, I had the same question.' },
    ],
  },
  {
    id: EASTER_EGG_ID,
    category: 'general',
    moduleId: null,
    title: 'Why is everyone acting weird today? 👀',
    author: 'khalid-n',
    ago: m(175),
    votes: 23,
    tags: [],
    body: 'Is it just me, or is everyone in a suspiciously good mood today? People keep smiling at me in the corridor. What did I miss?',
    replies: [
      { id: 'a', author: 'zainab-k', ago: m(152), votes: 15, body: 'Nothing to see here 🙂' },
      { id: 'b', author: 'ali-h', ago: m(141), votes: 12, body: 'Just enjoy the launch.' },
      { id: 'c', author: 'noor-e', ago: m(133), votes: 18, body: 'My lips are sealed.' },
      { id: 'd', author: 'sayed-ali-m', ago: m(118), votes: 9, body: 'Weird? Everyone looks perfectly normal to me.' },
      {
        id: 'e', author: 'hussain-m', ago: m(96), votes: 7, body: '🤐',
        replies: [{ id: 'e1', author: 'khalid-n', ago: m(88), votes: 4, body: "Okay, now I'm even more confused." }],
      },
    ],
  },
  {
    id: 'lost-black-casio-calculator',
    category: 'general',
    moduleId: null,
    title: 'Lost: black Casio calculator with a name sticker on the back',
    author: 'jassim-k',
    ago: h(5),
    votes: 6,
    tags: ['lost-and-found'],
    accepted: 'a',
    body: 'I left it in one of the second-floor classrooms after the maths session yesterday. It has a sticker with my name on the back. Has anyone seen it?',
    replies: [
      {
        id: 'a', author: 'hawra-t', ago: m(272), votes: 5, body: 'There was one at the reception desk this morning.',
        replies: [{ id: 'a1', author: 'jassim-k', ago: m(240), votes: 2, body: 'Got it back, thank you so much!' }],
      },
    ],
  },
  {
    id: 'quiet-places-to-study-after-6pm',
    category: 'general',
    moduleId: null,
    title: 'Quiet places to study after 6pm?',
    author: 'layla-f',
    ago: d(3, 8),
    votes: 19,
    tags: ['campus'],
    body: 'The library gets busy before exams. Where do you study in the evenings?',
    replies: [
      { id: 'a', author: 'zainab-k', ago: d(3, 6), votes: 9, body: 'The library is calm after 7, most people leave for dinner.' },
      { id: 'b', author: 'ahmed-j', ago: d(3, 3), votes: 6, body: 'Any café on a weekday before 9pm. Headphones are a must.' },
      { id: 'c', author: 'noor-e', ago: d(2, 19), votes: 7, body: 'The group study rooms can be booked at reception. Ask early in the week.' },
      { id: 'd', author: 'hawra-t', ago: d(2, 2), votes: 3, body: 'Home, with my phone in another room. Works better than any café.' },
    ],
  },
];

/**
 * The hidden Teacher's Day reveal (only on the easter-egg thread with ?reveal=1). Never shown by default.
 * Signed by every student; not attributed to any tutor or staff member.
 */
export const REVEAL_REPLY = {
  id: 'reveal',
  author: 'everyone',
  votes: 160,
  body: md`
    Okay, okay. **Happy Teacher's Day** to all 17 of our tutors! 💛

    Thank you for the lectures, the office hours, the past papers and all the patience. This launch was for you.
  `,
};

// DSBA Pulse — module catalogue, extracted from v1 src/legacy/components/subjects/subjects.jsx.
// GENERATED once by /home/claude/v2-spec/gen-data.mjs and verified by verify-data.mjs.
// Every v1 link, note, chapter and video is here. Cleaned strings keep their v1 original
// (v1Name / v1Title / v1Description); v1 '#' placeholder links are null.
//
// Module: {
//   id, v1Code, unitCode|null, name, v1Name, shortName, year: 1|2|3, description, icon (Phosphor name),
//   resources: { materials, exercises, exercisesNote, vle, olderExams, cheatSheet },  // string|null each
//   notes: [{ name, author|null, url, v1Name? }],
//   chapters: [{ title, v1Title?, audioUrl?, videos: Video[] }],
// }
// Video: { kind: 'youtube', id } | { kind: 'youtube-playlist', id } | { kind: 'bbb', url }

// v1 detection rule (SubjectCard.renderVideoEmbed): 'youtube.com'/'youtu.be' → YouTube;
// contains 'bibf' → BigBlueButton playback; otherwise a YouTube id, and id.length > 20 → playlist.
export function classifyVideo(raw) {
  const s = String(raw);
  if (s.includes('youtube.com') || s.includes('youtu.be')) return { kind: 'youtube', id: s };
  if (s.includes('bibf')) return { kind: 'bbb', url: s };
  return s.length > 20 ? { kind: 'youtube-playlist', id: s } : { kind: 'youtube', id: s };
}

const yt = (id) => ({ kind: 'youtube', id });
const playlist = (id) => ({ kind: 'youtube-playlist', id });
const bbb = (url) => ({ kind: 'bbb', url });

export const YEARS = [1, 2, 3];

export const MODULES = [
  // ── Year 1 ────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'economics',
    v1Code: 'economics',
    unitCode: 'EC1002',
    name: 'Introduction to Economics',
    v1Name: 'Introduction to Economics',
    shortName: 'Economics',
    year: 1,
    description: 'Explore fundamental economic concepts and their impact on everyday life and decision-making.',
    v1Description: 'Explore fundamental economic concepts and their impact on everyday life and decision-making',
    icon: 'ChartLineUp',
    resources: {
      materials: 'https://drive.google.com/drive/folders/10-bmpUWIF6OjWW7IRmTieHvOLatgXK1s',
      exercises: 'https://drive.google.com/drive/folders/1vLikzvO93XaI7vsBxOMRUcGNfkju_sCI',
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1zgPXPdSL7xRub_KJMoCspk5oVRVZekQw',
      olderExams: 'https://drive.google.com/drive/folders/1BKhfzdhDl_yER6F-jrKdwbnFOEmmH1bk',
      cheatSheet: null,
    },
    notes: [
      { name: 'Mahdi', author: 'Mahdi', url: 'https://drive.google.com/drive/folders/1YkMc0eGzvphYu1i3wGeo1w7d4B2F_I1_' },
      { name: 'Mohamed Hasan', author: 'Mohamed Hasan', url: 'https://drive.google.com/drive/folders/14skhlfQ72aXUaQEyKk5VefBlPou5mfuY' },
    ],
    chapters: [
      {
        title: 'The Economic Problem',
        videos: [
          yt('W9IjktFC9Tg'), yt('IzccVWouIxM'), yt('YboSszwySzU'), yt('HneRNVtahYw'), yt('AebGGq5n3Ec'),
          yt('YtX6SGw7E3c'), yt('R4Pf1OQQTPY'),
        ],
      },
      {
        title: 'Supply and Demand',
        videos: [
          yt('b1QL1BZ7jJM'), yt('JcN4dBoerwc'), yt('r1Xq9FcxDB8'), yt('aKpsUBbD8jM'), yt('ROF15eoLkrg'),
        ],
      },
      {
        title: 'Elasticity',
        videos: [
          yt('QtQohZw_4Gg'), yt('AiIN0zXMVFc'), yt('hyMohEr3VIk'),
        ],
      },
      {
        title: 'Consumer Choice',
        videos: [
          yt('iFbnwKv2o7w'), yt('TkFJdeF2Ifo'), yt('pLhh_D5b_Lg'),
        ],
      },
      {
        title: 'The Firm',
        videos: [
          yt('5ISuhZw3PG4'), yt('m9bXUYwvx2c'),
        ],
      },
      {
        title: 'Perfect Competition',
        v1Title: 'Perfect Competiton',
        videos: [
          yt('k0vSP8ayY0g'),
        ],
      },
      {
        title: 'Pure Monopoly',
        videos: [
          yt('E07bl-TUmmY'), yt('D7vYXago3-A'),
        ],
      },
      {
        title: 'Market structure and Imperfect Competition',
        videos: [
          yt('AoCVu3Tr2tk'), yt('ECMD9OAsBmQ'), yt('idFuhMRzr0Y'),
        ],
      },
      {
        title: 'The Labour Market',
        videos: [
          yt('_2Xi866KB8A'),
        ],
      },
      {
        title: 'Welfare Economics',
        videos: [
          yt('PC3qooaF5Xs'), yt('osvoVuESEKY'),
        ],
      },
      {
        title: 'Introduction to Macroeconomics',
        videos: [
          yt('qtNZSbzRP3A'), yt('ZdGnhusKnRU'), yt('iNfNZ1mIGRE'),
        ],
      },
      {
        title: 'Supply-side economics and economic growth',
        videos: [
          yt('PvfdPfEd-gk'), yt('ldszxyaFcHk'), yt('E3Niu4E1kbI'), yt('EUOcBo-gzdE'), yt('7yeWBFzGHS4'),
          yt('SAgt0oAv2FI'), yt('mHP8q-em1wo'),
        ],
      },
      {
        title: 'Output and aggregate demand (playlist)',
        v1Title: 'Output and aggregate demand (Playlist) skip to go to the next',
        videos: [
          playlist('PL_o_l6j2TdmhF9DN-n3IIq5fTFmMTT14y'),
        ],
      },
      {
        title: 'Money and banking; interest rates and monetary transmission',
        videos: [
          yt('5dTvjezJz6s'),
        ],
      },
      {
        title: 'Monetary and fiscal policy',
        videos: [
          yt('FOzxImnSIAw'), yt('m6xo8gxMaCs'), yt('Kf8CTCFEldY'), yt('1xI0dDf58XM'), yt('0-pksf2Xfl4'),
          yt('P6JQI0Ki6Tk'), yt('V2bj1c2KYkQ'), yt('1nWhiVNXudk'),
        ],
      },
      {
        title: 'Aggregate demand and Aggregate supply',
        videos: [
          yt('xXNrloLHOzI'), yt('H2rtsMNbkIs'), yt('knRHiexdKe8'), yt('efQjQuqzDzM'),
        ],
      },
      {
        title: 'Inflation',
        videos: [
          yt('dOn2ey5_EYQ'), yt('eF2Xn7Ww2_M'), yt('dE0wIcaCVGE'), yt('ABOGxIHVHO4'), yt('uNpezr7XFcw'),
          yt('_TBxupIhsro'), yt('522lWzrot1c'),
        ],
      },
      {
        title: 'Unemployment',
        videos: [
          yt('J-Id_7of0GU'), yt('SfL3jefilPo'),
        ],
      },
      {
        title: 'Exchange rates and the balance of payments',
        videos: [
          yt('EiXYP93hvGQ'), yt('1Gs1KrTBIBM'), yt('zcyMQ_zuF1w'), yt('nGvv08etNDI'), yt('DGRknAQNWIk'),
          yt('TuyPLN8VR1M'), yt('j2-q3Abvrzs'), yt('IUwB3xDgmFU'), yt('cg17YTtsk2U'),
        ],
      },
      {
        title: 'Open Economy Macroeconomics',
        videos: [
          yt('HSd7ybLJUuw'),
        ],
      },
    ],
  },
  {
    id: 'business',
    v1Code: 'Business',
    unitCode: 'MN1178',
    name: 'Business and Management in a Global Context',
    v1Name: 'Business and Management',
    shortName: 'Business',
    year: 1,
    description: 'Examine key principles of business and management.',
    v1Description: 'Examine key principles of business and managements.',
    icon: 'Briefcase',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1IUDX2mKk4WfB0Ai8KM5skSWszQ0wwvGB',
      exercises: 'https://drive.google.com/drive/folders/1t0xlM6_JO7eDfLx4n8kwj5MxKahCBJmx',
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1eKSlpErYGEbhWXRYCR5EJc_LR38v_BrA',
      olderExams: 'https://drive.google.com/drive/folders/14KD14Hxf8WAgv_LcfoRXUcVGhyDc8oO9',
      cheatSheet: null,
    },
    notes: [
      { name: 'Feras full revision', author: 'Feras', url: 'https://drive.google.com/file/d/1H37pHRqBIbPuqN5e17KRmvChuPF2iHbP/view' },
      { name: '𓇼🧽🍍 Patrick: Business Edition', author: null, url: 'https://drive.google.com/drive/folders/1TENUe107415KrFFvtpCnyF7vlxUEHnfY' },
    ],
    chapters: [
      {
        title: 'Globalisation',
        videos: [
          yt('aguTvH4Tc-c'),
        ],
      },
      {
        title: 'Political, economic and legal environments',
        v1Title: 'Political, econmoic and legal evnvironments',
        videos: [
          yt('k1wbj3aXPsQ'),
        ],
      },
      {
        title: 'Informal Institutions',
        videos: [
          yt('9GFyMXHWo6w'),
        ],
      },
      {
        title: 'International Trade and Investment',
        videos: [
          yt('KROTqSzz4BQ'),
        ],
      },
      {
        title: 'Multilateral organisations and regional integration',
        videos: [
          yt('CkhdBMXcu0k'),
        ],
      },
      {
        title: 'Exchange Rates',
        videos: [
          yt('NQXwvmRgIf0'),
        ],
      },
      {
        title: 'Overview of Strategy and the Enterprise in International Context',
        videos: [
          yt('ldGfvoeq0IA'),
        ],
      },
      {
        title: 'Competitive Strategy for International Business',
        videos: [
          yt('c0XJDVKBBwc'),
        ],
      },
      {
        title: 'International Business Strategies: Market Entry and Growth',
        videos: [
          yt('SNjn9h3QVUk'),
        ],
      },
      {
        title: 'International Marketing and R&D Strategy',
        videos: [
          yt('nG2fesHT0Ss'),
        ],
      },
      {
        title: 'Global Sourcing and Production',
        v1Title: 'Global-Sourcing-Production',
        videos: [
          yt('u1pS_hwYkkc'),
        ],
      },
      {
        title: 'Global information systems management',
        videos: [
          yt('ADEyI7AvEcI'),
        ],
      },
      {
        title: 'International Project Management',
        v1Title: 'International-Project-Management',
        videos: [
          yt('ngiDb1ugbnM'),
        ],
      },
      {
        title: 'International Human Resource Management',
        v1Title: 'International-Human-Resource-Man',
        videos: [
          yt('mubdwgK6Ss'),
        ],
      },
      {
        title: 'International Project Management',
        videos: [
          yt('AQwveBtsuyI'),
        ],
      },
      {
        title: 'Global Digital Management',
        videos: [
          yt('uJSwD5Vzbhk'),
        ],
      },
    ],
  },
  {
    id: 'mathematics',
    v1Code: 'mathematics',
    unitCode: 'MT1186',
    name: 'Mathematical Methods',
    v1Name: 'Mathematical Methods',
    shortName: 'Maths',
    year: 1,
    description: 'Delve into sophisticated mathematical theories and their real-world applications.',
    v1Description: 'Delve into sophisticated mathematical theories and their real-world applications',
    icon: 'Function',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1OoirkioHtZGzmI9M1JXMkvE6exSUUiJx',
      exercises: 'https://drive.google.com/drive/folders/13n0MsLtWx7b8jhtll4B6spZwtVenGWbk?sort=13&direction=a',
      exercisesNote: 'Dr. Mahmood\'s chapters have everything covered.',
      vle: 'https://drive.google.com/drive/folders/1kdEB7pHSGgwvZLkh7ixE4Wo885Evd7K9',
      olderExams: 'https://drive.google.com/drive/folders/1amoR_NggUIMMtpNYzgYp3XwT0mnrJ82Y',
      cheatSheet: null,
    },
    notes: [],
    chapters: [
      {
        title: 'Functions',
        videos: [
          yt('1EGFSefe5II'), yt('KyOQhC8ctxc'), yt('f-_UsIP5jyA'), yt('GsIo3B46yjU'), yt('ih01YszlraY'),
          yt('bowrJ31ojOg'), yt('m1OitPmkydY'), yt('JEIH5HeneXc'),
        ],
      },
      {
        title: 'Differentiation',
        videos: [
          yt('962lLfW-8Jo'), yt('EY6FHX6asU0'), yt('AvCQQ3X4Nuc'), yt('qr1WXiq3S3k'), yt('RJJSiNz5oto'),
          yt('8dr1dZjfhmc'), yt('s7rd9YPJrNc'), yt('zmnh448y_ZU'), yt('FIbpibkywmk'), yt('2g8zJzMViXU'),
          yt('itkoiNNxNa4'), yt('fml0-ELYLaE'),
        ],
      },
      {
        title: 'One Variable Optimisation',
        videos: [
          yt('Mx39JbbzEAo'), yt('nQ6tOORDQ3I'), yt('29GbRaQxtzY'), yt('-PYebK8DKPc'), yt('8u6woY05aL0'),
          yt('SWZcq_biZLw'), yt('qGCKjuhA4eQ'), yt('JZCg6zmrmDI'),
        ],
      },
      {
        title: 'The Art of Integration',
        videos: [
          yt('o75AqTInKDU'), yt('SVrn1tRtZmg'), yt('aiBD9aI69C8'), yt('t3rzxSgvZZk'), yt('zNU8iK8sGD0'),
          yt('2I-_SV8cwsw'), yt('KJGp0pyPoVo'), yt('qijx9zx3HNQ'), yt('UjTTx2eYrx8'), yt('DcfYmzt4jnY'),
        ],
      },
      {
        title: 'Functions of Several Variables',
        videos: [
          yt('nIJQPX5kxp4'), yt('acdX4YamDtU'), yt('CBgn0z0huW8'), yt('IXuu7szVnN8'), yt('EkZGBdY0vlg'),
          yt('tXryaM-mTpY'), yt('OBELQIPH5xY'), yt('J08-L2buigM'), yt('fZhHJdPjtYc'),
        ],
      },
      {
        title: 'Multivariate Optimisation',
        videos: [
          yt('kPL28zgEFk8'), yt('_Ffcr98c7EE'), yt('nUfYR5FBGZc'), yt('Ob56YXIV3rM'),
        ],
      },
      {
        title: 'Matrices and Linear Equations',
        videos: [
          bbb('https://vc.bibf.com/playback/presentation/2.3/a5043fc46d3971f08c145ede6437f67fdeb24b60-1676264200087'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/4c7c05fd956e4e26aef314c126f07178e416dabe-1676350815340'),
          yt('TQvxWaQnrqI'),
          yt('WTLl03D4TNA'),
        ],
      },
      {
        title: 'Differential Equations',
        v1Title: 'differential equations',
        videos: [
          yt('EWVSxND_iWA'), yt('5LkQEOPwqfk'), yt('HjioXdmwze0'), yt('_4Bq6I68Yn4'), yt('WfX20b-peDw'),
          yt('ZWXG3c7A_9s'), yt('kATxKuVSc9I'), yt('fpQoL5u5ihs'), yt('UFWAu8Ptth0'), yt('SPVqgkOZMAc'),
          yt('UyCwAFQt4v0'), yt('3uO_uPb9H8w'), yt('6xEO4BeawzA'), yt('jJyRrIZ595c'), yt('rGaM6pwqhB0'),
          yt('NW9JfMvIsxw'), yt('znE4Nq9NJCQ'), yt('hbJ2o9EUmJ0'), yt('I3vIAzMcm4Y'), yt('vAepSNDLZRM'),
          yt('YavFKipIeio'), yt('yvFr5D7UAMQ'),
        ],
      },
      {
        title: 'Difference Equations',
        v1Title: 'difference equations',
        videos: [
          yt('YIoukM31_nI'), yt('Hk8Q0pd5G1s'), yt('yYbmY9N4SNs'),
        ],
      },
    ],
  },
  {
    id: 'statistics',
    v1Code: 'statistics',
    unitCode: 'ST1215',
    name: 'Introduction to Mathematical Statistics',
    v1Name: 'Introduction to Mathematical Statistics',
    shortName: 'Statistics',
    year: 1,
    description: 'Master the art of data interpretation and predictive modeling.',
    v1Description: 'Master the art of data interpretation and predictive modeling',
    icon: 'ChartBar',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1EQX5mEJUOd6mlqrS4FkRNuZ1ofxum8ez',
      exercises: null,
      exercisesNote: 'Dr. Yasser\'s exercise sets cover long questions, and unfortunately, you have to go to the VLE for MCQ. 🗿',
      vle: 'https://drive.google.com/drive/folders/1lYRiewf-MEFf-ITppq7dAtuJCej-yK1-',
      olderExams: 'https://drive.google.com/drive/folders/1RYnn5Uuolc8JLQ2TVdA07vAkNNStuvsC',
      cheatSheet: null,
    },
    notes: [
      { name: 'Nasser', author: 'Nasser', url: 'https://drive.google.com/drive/folders/1qcIgZ8MzS_2IyIICyCY6JChfHJj4OsCi' },
      { name: 'Mariam Nasser', author: 'Mariam Nasser', url: 'https://drive.google.com/drive/folders/1dvdGf86_7AyhMuxNzzd7ORnG4QIH_BmV' },
      { name: 'Product and Sigma Notation', author: null, url: 'https://drive.google.com/drive/folders/1bl81qDEuqa34zs4UzZoBvGT0OrvjHPnm', v1Name: 'Product and Sigma Notaion' },
    ],
    chapters: [
      {
        title: 'Probability Theory',
        videos: [
          bbb('https://vc.bibf.com/playback/presentation/2.3/985fd6c54dbe7e139c1c86a60304c7b18c82f606-1726548801542'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/7b9eb7f7dba2c8737fe8c658c07f0cc83d6b9176-1726736271504'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/f23f058bda0a399f33ed962e9406ad9a2ff955ba-1726981115673'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/97d19cc5cfa22d422046f8c33277c38d567c111e-1727153828299'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/4ea00ab33d08eb7103035f77dd958d783a742395-1727341013389'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/1e139c2089d0b1ba102b6ca80ee7a9b21ef67ab4-1727605984348'),
        ],
      },
      {
        title: 'Random Variables',
        videos: [
          bbb('https://vc.bibf.com/playback/presentation/2.3/1ab1ae7381a6fcc1e3d8ea709204fd7e31a085ac-1727778272013'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/21023752c3eab8780f489dd8c5298e006878f34b-1727946137711'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/9d3bac605dea955b6533fde9301faa8e480d0fb8-1728210609891'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/b3d7809b66aef56d8ab4594f897be4403ff86e17-1728383138486'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/d1d0f95143107da7ad7b1e95dd9cec11103f40e0-1728550959309'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/d26b5547690da25c7c95c9b6f9d883b8f02989db-1728815259448'),
        ],
      },
      {
        title: 'Common Distributions of Random Variables',
        videos: [
          bbb('https://vc.bibf.com/playback/presentation/2.3/0754a89ffc88893c6ad0cc4fe7b4439154f7111e-1728988079422'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/cc8c86ebe35fbbb9b38217614313e2841dcdb44a-1729155587247'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/b4e5534d626065c284710f5249839e6f12d8b62f-1729420169390'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/94ffd40d5ebaa19edef4b22db42c07c279b70fe6-1729592969374'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/54bb14a2f0aa8f2233027114100b4f7e99153ed7-1729760497898'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/35aa8fdc99ebc6c514900e0d10d6475efc1e6f0c-1730024840073'),
        ],
      },
      {
        title: 'Multivariate Random Variables',
        videos: [
          bbb('https://vc.bibf.com/playback/presentation/2.3/0df66cc7e53dc62870d4381584838ba7b21d05c8-1730197717513'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/846144916551f3653e99f908903680fad1583c41-1730365402967'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/11e2dacc0511c1e020eeef6a222173b7f334b39c-1730630127389'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/6d39771c4b9fdbcc3c08e75f027352da6009b3f6-1730802627532'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/16337a65f47375ab28ccb54ad0bdeff14b4b5fa8-1730969965689'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/0ed04dc535441cd50b10300abd8d4e0afba73d1d-1731234443655'),
        ],
      },
      {
        title: 'Sampling Distributions of Statistics',
        videos: [
          bbb('https://vc.bibf.com/playback/presentation/2.3/64bddc04337fece09731382d9f340e0219e56235-1731407439809'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/7c6f164ecef9064640826013840f2d036d13902d-1731574681618'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/3838daca2e90dfd6281ded175bc56cdd1260bd42-1731839386070'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/1c87689f2c56832f0c2b4a1744c80c563a3aedc7-1732012416076'),
          yt('80ffqpZdKiA'),
          yt('UetYS3PaHIo'),
          yt('G_RDxAZJ-ug'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/39b3715d9e88d5df9c391827aadcfa9844b7a264-1732444516154'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/c0b7acbeb8c3b0ffc38afd3f83b9fc61da015210-1737628152762'),
        ],
      },
      {
        title: 'Point Estimation',
        videos: [
          bbb('https://vc.bibf.com/playback/presentation/2.3/39b3715d9e88d5df9c391827aadcfa9844b7a264-1732444516154'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/faf83674afb98c2c185125de50da28a934eb321e-1732616975026'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/bb09f31166f480a627ecc2a0db1da942d98077ec-1733048490844'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/d1369d3c0416edd63fad598b935d1073b1304e8f-1733221687080'),
          yt('D1hgiAla3KI'),
        ],
      },
      {
        title: 'Interval Estimation',
        videos: [
          bbb('https://vc.bibf.com/playback/presentation/2.3/c035537d6d80583264e9a051ea5a34c5d28654af-1733653795927'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/f62fa560cba372898a14413bade50ab996365917-1733826609321'),
        ],
      },
      {
        title: 'Hypothesis Tests',
        videos: [
          bbb('https://vc.bibf.com/playback/presentation/2.3/cfd64087a22d227928487362fe4d6c10b7daee0a-1736245614039'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/b334e6e8f6f1416bba7f4233c8c9f028b443ffbd-1736677681258'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/6be55e03b52ca232ecf424cf8623d8b56e440e42-1736850586218'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/c05682f13539e48f8d5130b486e0c3ee5e1155ed-1737282756347'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/9a088976eef7fd2ab095f05e71d29deeb4cbb0cc-1737455532609'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/c0b7acbeb8c3b0ffc38afd3f83b9fc61da015210-1737628152762'),
        ],
      },
      {
        title: 'ANOVA',
        v1Title: 'Anova',
        videos: [
          bbb('https://vc.bibf.com/playback/presentation/2.3/fffbdb6876b5d7f107ac568dee4d11cad53d656d-1738665051066'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/6e912f7d532e2fbc50da2e22068e401a7bb0e69d-1738837727859'),
        ],
      },
      {
        title: 'Linear Regression',
        videos: [
          bbb('https://vc.bibf.com/playback/presentation/2.3/ba0835a6894106f047020819044cce905bb76a34-1739096839644'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/c40967d7c7dea42181a6906aaa922d49f8a4b2be-1739269923481'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/ad6cd478b20127be9ab7e58609ae43f7dae284c7-1739442771751'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/427f00e2db559c264111024083de8ff57c262e5e-1739701688696'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/71c3d17d81d8b494e1b4964ba47faeff9d12b2df-1740306319710'),
          bbb('https://vc.bibf.com/playback/presentation/2.3/de69448ae26c52ed01d9b99dcab3e38fb0a9e14c-1740479374347'),
        ],
      },
    ],
  },
  // ── Year 2 ────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'advanced-stats-distribution',
    v1Code: 'advanced_stats_distribution',
    unitCode: 'ST2133',
    name: 'Advanced Statistics: Distribution Theory',
    v1Name: 'Advanced Statistics Distribution Theory',
    shortName: 'Distribution theory',
    year: 2,
    description: 'Deep dive into advanced statistical distribution theories and their applications.',
    v1Description: 'Deep dive into advanced statistical distribution theories and their applications',
    icon: 'WaveSine',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1tQdHFpyDt8PECkNB5iK_PIVZf-oCC_fR',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1uFBOfH-M7bZEDlN4qz6flxG7szMciGnk?usp',
      olderExams: 'https://drive.google.com/drive/folders/1uFBOfH-M7bZEDlN4qz6flxG7szMciGnk?usp',
      cheatSheet: null,
    },
    notes: [
      { name: 'Mohamed study guide', author: 'Mohamed', url: 'https://drive.google.com/file/d/1T0enLYVk9CZhcnYOhsXRwpP2IU9V45mG/view?usp=drive_link' },
    ],
    chapters: [
      {
        title: 'Probability Space',
        videos: [
          yt('swa1VRYms3Q'), yt('lsHr3Y9-PCA'), yt('V3pnr5gmJC8'), yt('DqGUwoz4d4M'), yt('ptVgsHPAZ-4'),
          yt('nPK62LCNVcQ'), yt('3lmEqp8VhAU'), yt('XJnIdRXUi7A'), yt('N_QU1BiW6sI'),
        ],
      },
      {
        title: 'Random variables and univariate distributions',
        videos: [
          yt('mlelI1LA9o4'), yt('GDJFLfmyb20'), yt('Uks98M-dxqM'), yt('bT1p5tJwn_0'), yt('qIzC1-9PwQo'),
          yt('L2KMttDm3aY'), yt('zq9Oz82iHf0'), yt('jmqZG6roVqU'), yt('BPlmjp2ymxw'), yt('J3KSjZFVbis'),
          yt('gIsoceE4vhg'), yt('juF3r12nM5A'), yt('TwvXhX3bJJM'),
        ],
      },
    ],
  },
  {
    id: 'advanced-stats-inferential',
    v1Code: 'advanced_stats_inferential',
    unitCode: 'ST2134',
    name: 'Advanced Statistics: Statistical Inference',
    v1Name: 'Advanced Statistics Inferential Statistics',
    shortName: 'Statistical inference',
    year: 2,
    description: 'Master advanced statistical inference techniques and hypothesis testing.',
    v1Description: 'Master advanced statistical inference techniques and hypothesis testing',
    icon: 'Scales',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1lAEhLnaBz5t7JaRtRhb27FLFePgmZaIm',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1-P9meuAI_tHZJdFt2n_jzq8x6Had_8_T?usp',
      olderExams: 'https://drive.google.com/drive/folders/1-P9meuAI_tHZJdFt2n_jzq8x6Had_8_T?usp',
      cheatSheet: null,
    },
    notes: [
      { name: 'Product and Sigma Notation', author: null, url: 'https://drive.google.com/drive/folders/1bl81qDEuqa34zs4UzZoBvGT0OrvjHPnm', v1Name: 'Product and Sigma Notaion' },
    ],
    chapters: [],
  },
  {
    id: 'programming-data-science',
    v1Code: 'programming_data_science',
    unitCode: 'ST2195',
    name: 'Programming for Data Science',
    v1Name: 'Programming for Data Science',
    shortName: 'Programming',
    year: 2,
    description: 'Learn programming languages and tools essential for data science applications.',
    v1Description: 'Learn programming languages and tools essential for data science applications',
    icon: 'TerminalWindow',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1D4RrwCClsxrIRrV0CnhTGTpZI5DFAHDi',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1GB4iV2VE6zc4uBjygkQhaIpPBe6MnlFr?usp',
      olderExams: 'https://drive.google.com/drive/folders/1GB4iV2VE6zc4uBjygkQhaIpPBe6MnlFr?usp',
      cheatSheet: 'https://docs.google.com/document/d/1fiO4uLqivuYNF_SPDIYxiXClRDWwlI9U/edit?usp=drive_link&ouid=114257845455063086777&rtpof=true&sd=true',
    },
    notes: [],
    chapters: [
      {
        title: 'R for Data Science (full course)',
        videos: [
          yt('_V8eKsto3Ug'),
        ],
      },
      {
        title: 'Python for Data Science (full course)',
        videos: [
          yt('wUSDVGivd-8'),
        ],
      },
      {
        title: 'Git (full course)',
        videos: [
          yt('8JJ101D3knE'),
        ],
      },
      {
        title: 'SQL (full course)',
        videos: [
          yt('7mz73uXD9DA'),
        ],
      },
      {
        title: 'Block 1: Intro to Data Science, R, Python & Git',
        videos: [
          yt('K418swtFnik'), yt('DNS7i2m4sB0'),
        ],
      },
      {
        title: 'Block 2: Data Types, Structures & File Formats (R & Python)',
        videos: [
          yt('k0zLwDAQ6Uw'), yt('lLRBYKwP8GQ'), yt('vmEHCJofslg'), yt('q5uM4VKywbA'),
        ],
      },
      {
        title: 'Block 3: SQL and Databases (SQLite, R, Python)',
        videos: [
          yt('h0nxCDiD-zg'), yt('m1KcNV-Zhmc'), yt('ZfliyOawJFk'), yt('pd-0G0MigUA'),
        ],
      },
      {
        title: 'Block 4: Programming Concepts in R (Control Flow & Functions)',
        videos: [
          yt('66AkNi2C5tw'), yt('9lP0uSRnih0'), yt('Xza0pUVHRS4'),
        ],
      },
      {
        title: 'Block 5: Variables, Mutability, Aliasing & OOP (Python)',
        videos: [
          yt('RvRKT-jXvko'), yt('5qQQ3yzbKp8'), yt('JeznW_7DlB0'),
        ],
      },
      {
        title: 'Block 6: Data Wrangling (R & Python)',
        videos: [
          yt('oXImkptBpqc'), yt('sV5lwAJ7vnQ'), yt('bDhvCp3_lYw'),
        ],
      },
      {
        title: 'Block 7-8: Data Visualisation & Web/APIs',
        videos: [
          yt('HPJn1CMvtmI'), yt('oVQBwHQXXhc'), yt('v3w24XfD5m8'), yt('XqIfWkVI3UA'),
        ],
      },
      {
        title: 'Block 9: Machine Learning Frameworks',
        videos: [
          yt('IpGxLWOIZy4'), yt('BR9h47Jtqyw'), yt('fSytzGwwBVw'), yt('gJo0uNL-5Qw'), yt('SIEaLBXr0rk'),
          yt('oXLxQVyvEa8'),
        ],
      },
      {
        title: 'Block 10: Software Development & R Packages',
        videos: [
          yt('Fi3_BjVzpqk'), yt('8eVXTyIZ1Hs'), yt('79s3z0gIuFU'), yt('DWkIbk_HE9o'),
        ],
      },
    ],
  },
  {
    id: 'business-analytics',
    v1Code: 'business_analytics',
    unitCode: 'ST2187',
    name: 'Business Analytics, Applied Modelling and Prediction',
    v1Name: 'Business Analytics',
    shortName: 'Business analytics',
    year: 2,
    description: 'Apply analytical methods to solve complex business problems and drive decision-making.',
    v1Description: 'Apply analytical methods to solve complex business problems and drive decision-making',
    icon: 'PresentationChart',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1OFKhC9jh_Ax-cIP8ZmTLOJet4zNsqHgg',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1TJ6rBkb7rrXbUMfPEuhWtBN2ZLAbCZYT?usp',
      olderExams: 'https://drive.google.com/drive/folders/1TJ6rBkb7rrXbUMfPEuhWtBN2ZLAbCZYT?usp',
      cheatSheet: null,
    },
    notes: [
      { name: 'Mohamed', author: 'Mohamed', url: 'https://drive.google.com/file/d/1hq0iMegUQ1zq-zAkSuZyCt06g9Vrf68y/view?usp=drive_link' },
    ],
    chapters: [
      {
        title: 'Excel (recommended course)',
        v1Title: 'good Excel course',
        videos: [
          yt('kghcAk7l6eA'),
        ],
      },
      {
        title: 'Tableau (recommended course)',
        v1Title: 'good Tableau course',
        videos: [
          yt('dahrmqT5GD4'),
        ],
      },
      {
        title: 'Block 1: Decision-Making Under Uncertainty and Modelling',
        videos: [
          yt('UgKrQ2ywVfs'), yt('HZGCoVF3YvM'), yt('M-z74nAun40'),
        ],
      },
      {
        title: 'Block 2: Descriptive Statistics',
        videos: [
          yt('SplCk-t1BeA'), yt('zjHfAhcU6kE'), yt('U0NZu6f5TMI'),
        ],
      },
      {
        title: 'Block 3: Exploring Relationships Between Variables',
        videos: [
          yt('Rwc4-MXl8VI'), yt('D7NKvMG8peo'), yt('IujCYxtpszU'),
        ],
      },
      {
        title: 'Block 5: Probability and Probability Distributions',
        videos: [
          yt('94AmzeR9n2w'), yt('OByl4RJxnKA'), yt('-7QG2itL1u4'),
        ],
      },
      {
        title: 'Block 6: Common Probability Distributions',
        videos: [
          yt('CjF_yQ2N638'), yt('3PWKQiLK41M'), yt('m0o-585xwW0'),
        ],
      },
      {
        title: 'Block 7: Decision Trees and EMV',
        videos: [
          yt('NQ-mYn9fPag'), yt('tbv9E9D2BRQ'), yt('ydvnVw80I_8'), yt('FUY07dvaUuE'),
        ],
      },
      {
        title: 'Block 8: Sampling and Sampling Distributions',
        videos: [
          yt('pTuj57uXWlk'), yt('7S7j75d3GM4'), yt('YAlJCEDH2uY'),
        ],
      },
      {
        title: 'Block 9: Confidence Interval Estimation',
        videos: [
          yt('6r5IZCjvIHI'), yt('dLEtlteLVJU'), yt('hlM7zdf7zwU'),
        ],
      },
      {
        title: 'Block 10: Hypothesis Testing',
        videos: [
          yt('VK-rnA3-41c'), yt('0oc49DyA3hU'), yt('UcZwyzwWU7o'),
        ],
      },
      {
        title: 'Block 11: Simple Linear Regression',
        videos: [
          yt('owI7zxCqNY0'), yt('aq8VU5KLmkY'), yt('P8hT5nDai6A'),
        ],
      },
      {
        title: 'Block 12: Multiple Regression Analysis',
        videos: [
          yt('EkAQAi3a4js'), yt('G1WX5GiFSWQ'), yt('S66FZa16RZc'), yt('Cba9LJ9lS8s'),
        ],
      },
      {
        title: 'Block 13: Time Series Analysis and Forecasting',
        videos: [
          yt('GE3JOFwTWVM'), yt('Wo5YWXDRXv8'), yt('k_HN0wOKDd0'), yt('C5J_QSR7ST0'),
        ],
      },
      {
        title: 'Block 14: Optimisation Models',
        videos: [
          yt('soTnusib1l8'), yt('FzY333RdrBM'), yt('J52iRkbrG1k'), yt('uaxOfTIC_pI'),
        ],
      },
      {
        title: 'Block 15: Monte Carlo Simulation',
        videos: [
          yt('7TqhmX92P6U'), yt('-Mp4CdDaoUE'), yt('Eb4jPVdaITg'),
        ],
      },
    ],
  },
  {
    id: 'econometrics',
    v1Code: 'econometrics',
    unitCode: 'EC2020',
    name: 'Elements of Econometrics',
    v1Name: 'Econometrics',
    shortName: 'Econometrics',
    year: 2,
    description: 'Study economic relationships using statistical methods and mathematical models.',
    v1Description: 'Study economic relationships using statistical methods and mathematical models',
    icon: 'ChartScatter',
    resources: {
      materials: 'https://drive.google.com/drive/folders/18mjbHAtmreWKvop-yx_HQlAm7wwclowI',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1jMpqxGHOG20U7MwMS-5o9WSdSZPUMkFZ?usp',
      olderExams: 'https://drive.google.com/drive/folders/1jMpqxGHOG20U7MwMS-5o9WSdSZPUMkFZ?usp',
      cheatSheet: null,
    },
    notes: [],
    chapters: [
      {
        title: 'Nature of Econometrics and Economic Data',
        videos: [
          yt('5lcQN-zbeGE'),
        ],
      },
      {
        title: 'The Simple Regression Model',
        videos: [
          yt('WHas2yaIlcs'),
        ],
      },
      {
        title: 'Multiple Regression Analysis: Estimation',
        videos: [
          yt('17nWWWUrUcg'),
        ],
      },
      {
        title: 'Inference',
        videos: [
          yt('S72V6trrwKY'),
        ],
      },
      {
        title: 'OLS Asymptotics',
        videos: [
          yt('nORu6KPc7o4'),
        ],
      },
      {
        title: 'Heteroskedasticity',
        videos: [
          yt('DMzBRYqAHrE'),
        ],
      },
      {
        title: 'Time series',
        videos: [
          yt('EhvPfZYJCkE'),
        ],
      },
      {
        title: 'Instrumental variables estimation',
        videos: [
          yt('GsL3OZTIcfo'),
        ],
      },
    ],
  },
  {
    id: 'information-systems',
    v1Code: 'information_systems',
    unitCode: 'IS2184',
    name: 'Information Systems Management',
    v1Name: 'Information System',
    shortName: 'Information systems',
    year: 2,
    description: 'Understand information systems design, implementation, and management in organizations.',
    v1Description: 'Understand information systems design, implementation, and management in organizations',
    icon: 'Database',
    resources: {
      materials: 'https://drive.google.com/drive/folders/14Ljj9Xyc7MT2Ri4fP_oI46ILhN1JIlOJ',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1RWlgsFWuWi1gX0iCZyNmdbcVfbzKyuEk?usp',
      olderExams: 'https://drive.google.com/drive/folders/1RWlgsFWuWi1gX0iCZyNmdbcVfbzKyuEk?usp',
      cheatSheet: null,
    },
    notes: [
      { name: 'Mahdi', author: 'Mahdi', url: 'https://drive.google.com/drive/folders/1HbOmDlowIBqImfoWlN7ss2EOImXtMxxM' },
    ],
    chapters: [],
  },
  // ── Year 3 ────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'machine-learning',
    v1Code: 'machine_learning',
    unitCode: null,
    name: 'Machine Learning',
    v1Name: 'Machine Learning',
    shortName: 'Machine learning',
    year: 3,
    description: 'Study supervised and unsupervised learning methods, and how models are trained and evaluated.',
    v1Description: 'Study supervised and unsupervised learning methods, and how models are trained and evaluated',
    icon: 'Brain',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1L-t8lQegkEzglFVPEX3NybaWvI0faVX9',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1003IX08HxK09WOpjTV5dQC38ccR7ROt2',
      olderExams: null,
      cheatSheet: null,
    },
    notes: [],
    chapters: [],
  },
  {
    id: 'market-research',
    v1Code: 'market_research',
    unitCode: null,
    name: 'Statistical Methods for Market Research',
    v1Name: 'Statistical Methods for Market Research',
    shortName: 'Market research',
    year: 3,
    description: 'Apply statistical techniques to survey data and consumer research problems.',
    v1Description: 'Apply statistical techniques to survey data and consumer research problems',
    icon: 'ListChecks',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1qkJhwLxi-lQpJEh55xiIEOOpLT10XP89',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/13HgN5BskOB3nuB6TNDpHjkX4h7ccMRk7',
      olderExams: null,
      cheatSheet: null,
    },
    notes: [],
    chapters: [],
  },
  {
    id: 'microeconomics',
    v1Code: 'microeconomics',
    unitCode: null,
    name: 'Microeconomics',
    v1Name: 'Microeconomics',
    shortName: 'Microeconomics',
    year: 3,
    description: 'Analyse consumer and firm behaviour, market structures, and welfare in depth.',
    v1Description: 'Analyse consumer and firm behaviour, market structures, and welfare in depth',
    icon: 'Storefront',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1yT9qq6krw9r2WhAt_3ihW3jxrU_MdFWc',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1oCLFiXjm8tVq_TTatSn6zFq0EfNCOAf6',
      olderExams: null,
      cheatSheet: null,
    },
    notes: [],
    chapters: [],
  },
  {
    id: 'asset-pricing',
    v1Code: 'asset_pricing',
    unitCode: null,
    name: 'Principles of Asset Pricing',
    v1Name: 'Principles of Asset Pricing',
    shortName: 'Asset pricing',
    year: 3,
    description: 'Examine how financial assets are valued and how risk and return are related.',
    v1Description: 'Examine how financial assets are valued and how risk and return are related',
    icon: 'Coins',
    resources: {
      materials: 'https://drive.google.com/drive/folders/10WkXNxJG7nWL9DICHgdVAj5xi9bS1WtN',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1pyaBciV2CtsBHuPUTKa8u_TKSQgCDWwa',
      olderExams: null,
      cheatSheet: null,
    },
    notes: [],
    chapters: [],
  },
  {
    id: 'marketing-management',
    v1Code: 'marketing_management',
    unitCode: null,
    name: 'Marketing Management',
    v1Name: 'Marketing Management',
    shortName: 'Marketing',
    year: 3,
    description: 'Plan and evaluate marketing strategy, from segmentation through to the marketing mix.',
    v1Description: 'Plan and evaluate marketing strategy, from segmentation through to the marketing mix',
    icon: 'Megaphone',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1P3iHqYSe4qPwVRW6baj475Rsi_mpbP2h',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1w3pG9SwQu4URKUkNU7Igf8ym56BqVbGl',
      olderExams: null,
      cheatSheet: null,
    },
    notes: [],
    chapters: [],
  },
  {
    id: 'further-maths-economists',
    v1Code: 'further_maths_economists',
    unitCode: null,
    name: 'Further Mathematics for Economists',
    v1Name: 'Further Mathematics for Economists',
    shortName: 'Further maths',
    year: 3,
    description: 'Build the advanced mathematical tools used in economic analysis and optimisation.',
    v1Description: 'Build the advanced mathematical tools used in economic analysis and optimisation',
    icon: 'Sigma',
    resources: {
      materials: 'https://drive.google.com/drive/folders/1a6lakhRK3st9DRRGlGKPiCKNaTGoczIR',
      exercises: null,
      exercisesNote: null,
      vle: 'https://drive.google.com/drive/folders/1WwhnK5Z_lUdtWWDGo1DllnAzfPVs4hrF',
      olderExams: null,
      cheatSheet: null,
    },
    notes: [],
    chapters: [],
  },
];

/** v1 subject code → v2 module id (e.g. 'Business' → 'business'). */
export const V1_CODE_MAP = Object.fromEntries(MODULES.map((m) => [m.v1Code, m.id]));

const BY_ID = new Map(MODULES.map((m) => [m.id, m]));

/** Modules for a year, in v1 order. year null/undefined → all modules. */
export function getModulesForYear(year) {
  if (year == null) return MODULES;
  return MODULES.filter((m) => m.year === Number(year));
}

/** Module by v2 id (also accepts a v1 code such as 'Business'). Returns null if unknown. */
export function getModule(id) {
  if (!id) return null;
  return BY_ID.get(id) || BY_ID.get(V1_CODE_MAP[id]) || null;
}

/** Module by UoL unit code, e.g. 'ST2133'. */
export function getModuleByUnitCode(code) {
  return MODULES.find((m) => m.unitCode && m.unitCode === code) || null;
}

/** Display label: unit code + name when a code exists. */
export function moduleLabel(m) {
  return m ? (m.unitCode ? `${m.unitCode} ${m.name}` : m.name) : '';
}

/** Counts used for progress and badges. */
export function getModuleStats(m) {
  const r = m.resources;
  const links = [r.materials, r.exercises, r.vle, r.olderExams, r.cheatSheet].filter(Boolean).length;
  return {
    chapters: m.chapters.length,
    videos: m.chapters.reduce((n, c) => n + c.videos.length, 0),
    notes: m.notes.length,
    links,
  };
}

/** Stable key for a lesson (progress storage etc.). */
export function lessonKey(moduleId, chapterIndex, videoIndex) {
  return `${moduleId}:${chapterIndex}:${videoIndex}`;
}

/** iframe src for a video (same URLs v1 embedded). */
export function videoEmbedUrl(v) {
  if (!v) return null;
  if (v.kind === 'bbb') return v.url;
  if (v.kind === 'youtube-playlist') return `https://www.youtube.com/embed/videoseries?list=${v.id}`;
  if (v.id.includes('youtube.com') || v.id.includes('youtu.be')) return v.id;
  return `https://www.youtube.com/embed/${v.id}`;
}

/** Link to open the video at its source ("Open original"). */
export function videoSourceUrl(v) {
  if (!v) return null;
  if (v.kind === 'bbb') return v.url;
  if (v.kind === 'youtube-playlist') return `https://www.youtube.com/playlist?list=${v.id}`;
  if (v.id.includes('youtube.com') || v.id.includes('youtu.be')) return v.id;
  return `https://www.youtube.com/watch?v=${v.id}`;
}

/** YouTube thumbnail (null for playlists / BBB). External: always provide a fallback. */
export function videoThumbnailUrl(v) {
  return v && v.kind === 'youtube' && !v.id.includes('/') ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : null;
}

/** Human label for a video kind. */
export const VIDEO_KIND_LABEL = {
  youtube: 'YouTube',
  'youtube-playlist': 'YouTube playlist',
  bbb: 'Class recording',
};

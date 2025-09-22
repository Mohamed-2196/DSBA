import './SubjectCards.css';
import PropTypes from 'prop-types';
import { useState } from 'react';

const subjectIcons = {
  mathematics: '📐',
  statistics: '📊',
  Business: '💼',
  economics: '📈',
  advanced_stats_distribution: '📊',
  advanced_stats_inferential: '📈',
  programming_data_science: '💻',
  business_analytics: '📊',
  econometrics: '📈',
  information_systems: '💾'
};

const YouTubeEmbed = ({ embedId }) => {
  const isPlaylist = embedId.length > 20;
  return (
    <div className="video-responsive">
      <iframe
        width="853"
        height="480"
        src={
          isPlaylist
            ? `https://www.youtube.com/embed/videoseries?list=${embedId}`
            : `https://www.youtube.com/embed/${embedId}`
        }
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={isPlaylist ? "Embedded YouTube Playlist" : "Embedded YouTube Video"}
      />
    </div>
  );
};
YouTubeEmbed.propTypes = {
  embedId: PropTypes.string.isRequired
};

const BigBlueButtonEmbed = ({ url }) => (
  <div className="video-responsive">
    <iframe
      width="853"
      height="480"
      src={url}
      frameBorder="0"
      allow="microphone; camera; fullscreen; display-capture"
      allowFullScreen
      title="BigBlueButton Playback"
    />
  </div>
);

BigBlueButtonEmbed.propTypes = {
  url: PropTypes.string.isRequired
};

const SubjectCard = ({ name, description, code, chapters }) => {
  const [expandedChapter, setExpandedChapter] = useState(null);

const toggleChapter = (index) => {
  setExpandedChapter(expandedChapter === index ? null : index);
};

  const renderVideoEmbed = (videoId) => {
    if (videoId.includes('youtube.com') || videoId.includes('youtu.be')) {
      return <YouTubeEmbed embedId={videoId} />;
    } else if (videoId.includes('bibf')) {
      return <BigBlueButtonEmbed url={videoId} />;
    }
    return <YouTubeEmbed embedId={videoId} />;
  };

  const subjectMaterialsLinks = {
    mathematics: 'https://drive.google.com/drive/folders/1OoirkioHtZGzmI9M1JXMkvE6exSUUiJx',
    statistics: 'https://drive.google.com/drive/folders/1EQX5mEJUOd6mlqrS4FkRNuZ1ofxum8ez',
    Business: 'https://drive.google.com/drive/folders/1IUDX2mKk4WfB0Ai8KM5skSWszQ0wwvGB',
    economics: 'https://drive.google.com/drive/folders/10-bmpUWIF6OjWW7IRmTieHvOLatgXK1s',
    advanced_stats_distribution: 'https://drive.google.com/drive/folders/1tQdHFpyDt8PECkNB5iK_PIVZf-oCC_fR',
    advanced_stats_inferential: 'https://drive.google.com/drive/folders/1lAEhLnaBz5t7JaRtRhb27FLFePgmZaIm',
    programming_data_science: 'https://drive.google.com/drive/folders/1D4RrwCClsxrIRrV0CnhTGTpZI5DFAHDi',
    business_analytics: 'https://drive.google.com/drive/folders/1OFKhC9jh_Ax-cIP8ZmTLOJet4zNsqHgg',
    econometrics: 'https://drive.google.com/drive/folders/18mjbHAtmreWKvop-yx_HQlAm7wwclowI',
    information_systems: 'https://drive.google.com/drive/folders/14Ljj9Xyc7MT2Ri4fP_oI46ILhN1JIlOJ',
  };

  const studentsNotesLinks = {
    mathematics: [
    ],
    statistics: [
      { name: 'Nasser', link: 'https://drive.google.com/drive/folders/1qcIgZ8MzS_2IyIICyCY6JChfHJj4OsCi' },
      { name: 'Product and Sigma Notaion', link: 'https://drive.google.com/drive/folders/1bl81qDEuqa34zs4UzZoBvGT0OrvjHPnm' },

    ],
    Business: [
      { name: 'Feras full revision', link: 'https://drive.google.com/file/d/1H37pHRqBIbPuqN5e17KRmvChuPF2iHbP/view' },
      { name: '𓇼🧽🍍 Patrick: Business Edition', link: 'https://drive.google.com/drive/folders/1TENUe107415KrFFvtpCnyF7vlxUEHnfY' },
    ],
    economics: [
      { name: 'Mahdi', link: 'https://drive.google.com/drive/folders/1YkMc0eGzvphYu1i3wGeo1w7d4B2F_I1_' },
      { name: 'Mohamed Hasan', link: 'https://drive.google.com/drive/folders/14skhlfQ72aXUaQEyKk5VefBlPou5mfuY'},

    ],
    advanced_stats_distribution: [      { name: 'Product and Sigma Notaion', link: 'https://drive.google.com/drive/folders/1bl81qDEuqa34zs4UzZoBvGT0OrvjHPnm' },
],
    advanced_stats_inferential: [      { name: 'Product and Sigma Notaion', link: 'https://drive.google.com/drive/folders/1bl81qDEuqa34zs4UzZoBvGT0OrvjHPnm' },
],
    programming_data_science: [],
    business_analytics: [],
    econometrics: [],
    information_systems: [],
  };

  const subjectExerciseLinks = {
    Business: 'https://drive.google.com/drive/folders/1t0xlM6_JO7eDfLx4n8kwj5MxKahCBJmx',
    economics: 'https://drive.google.com/drive/folders/1vLikzvO93XaI7vsBxOMRUcGNfkju_sCI',
    mathematics: 'https://drive.google.com/drive/folders/13n0MsLtWx7b8jhtll4B6spZwtVenGWbk?sort=13&direction=a',
    advanced_stats_distribution: '#',
    advanced_stats_inferential: '#',
    programming_data_science: '#',
    business_analytics: '#',
    econometrics: '#',
    information_systems: '#',
  };

  const vleLinks = {
    mathematics: 'https://drive.google.com/drive/folders/1kdEB7pHSGgwvZLkh7ixE4Wo885Evd7K9',
    statistics: 'https://drive.google.com/drive/folders/1lYRiewf-MEFf-ITppq7dAtuJCej-yK1-',
    Business: 'https://drive.google.com/drive/folders/1eKSlpErYGEbhWXRYCR5EJc_LR38v_BrA',
    economics: 'https://drive.google.com/drive/folders/1zgPXPdSL7xRub_KJMoCspk5oVRVZekQw',
    advanced_stats_distribution: 'https://drive.google.com/drive/folders/1uFBOfH-M7bZEDlN4qz6flxG7szMciGnk?usp',
    advanced_stats_inferential: 'https://drive.google.com/drive/folders/1-P9meuAI_tHZJdFt2n_jzq8x6Had_8_T?usp',
    programming_data_science: 'https://drive.google.com/drive/folders/1GB4iV2VE6zc4uBjygkQhaIpPBe6MnlFr?usp',
    business_analytics: 'https://drive.google.com/drive/folders/1TJ6rBkb7rrXbUMfPEuhWtBN2ZLAbCZYT?usp',
    econometrics: 'https://drive.google.com/drive/folders/1jMpqxGHOG20U7MwMS-5o9WSdSZPUMkFZ?usp',
    information_systems: 'https://drive.google.com/drive/folders/1RWlgsFWuWi1gX0iCZyNmdbcVfbzKyuEk?usp',
  };

  const paidExamsLinks = {
    mathematics: 'https://drive.google.com/drive/folders/1amoR_NggUIMMtpNYzgYp3XwT0mnrJ82Y',
    statistics: 'https://drive.google.com/drive/folders/1RYnn5Uuolc8JLQ2TVdA07vAkNNStuvsC',
    Business: 'https://drive.google.com/drive/folders/14KD14Hxf8WAgv_LcfoRXUcVGhyDc8oO9',
    economics: 'https://drive.google.com/drive/folders/1BKhfzdhDl_yER6F-jrKdwbnFOEmmH1bk',
    advanced_stats_distribution: 'https://drive.google.com/drive/folders/1uFBOfH-M7bZEDlN4qz6flxG7szMciGnk?usp',
    advanced_stats_inferential: 'https://drive.google.com/drive/folders/1-P9meuAI_tHZJdFt2n_jzq8x6Had_8_T?usp',
    programming_data_science: 'https://drive.google.com/drive/folders/1GB4iV2VE6zc4uBjygkQhaIpPBe6MnlFr?usp',
    business_analytics: 'https://drive.google.com/drive/folders/1TJ6rBkb7rrXbUMfPEuhWtBN2ZLAbCZYT?usp',
    econometrics: 'https://drive.google.com/drive/folders/1jMpqxGHOG20U7MwMS-5o9WSdSZPUMkFZ?usp',
    information_systems: 'https://drive.google.com/drive/folders/1RWlgsFWuWi1gX0iCZyNmdbcVfbzKyuEk?usp',
  };

  return (
    <div className="subject-card">
      <div className="subject-card-content">
        <div className="subject-icon">
          {subjectIcons[code] || '📚'}
        </div>
        <h3 className="subject-title">{name}</h3>
        <p className="subject-description">{description}</p>

        <div className="subject-sections">
          <h4>Books and Study Guide</h4>
          <a
            href={subjectMaterialsLinks[code]}
            target="_blank"
            rel="noopener noreferrer"
          >
            Access Materials
          </a>

          <h4>Students Notes</h4>
          <ul>
            {studentsNotesLinks[code].map((student, index) => (
              <li key={index}>
                <a
                  href={student.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {student.name}
                </a>
              </li>
            ))}
          </ul>
          <h4>Exercises</h4>
{code === 'mathematics' ? (
  <p>
    Dr. Mahmood's chapters have everything covered. 
    <br />
    <a 
      href={subjectExerciseLinks['mathematics']} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="subject-link"
    >
      Access More Exercises
    </a>
  </p>
) : code === 'statistics' ? (
  <p>
    Dr. Yasser's exercise sets cover long questions, and unfortunately, you have to go to the VLE for MCQ. 🗿
    <br />
    <a 
      href={subjectExerciseLinks['statistics']} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="subject-link"
    >
      Access More Exercises
    </a>
  </p>
) :subjectExerciseLinks[code] =="#"?(<></>): (
  <a
    href={subjectExerciseLinks[code]}
    target="_blank"
    rel="noopener noreferrer"
    className="subject-link"
  >
    Access Exercises
  </a>
)}

          <h4>Previous Exams</h4>
          <div>
            <a
              href={vleLinks[code]}
              target="_blank"
              rel="noopener noreferrer"
              className="subject-link"
            >
              Access VLE Exams
            </a>
          </div>
          <div>
            <a
              href={paidExamsLinks[code]}
              target="_blank"
              rel="noopener noreferrer"
              className="subject-link"
            >
              Access Older Exams
            </a>
          </div>

          <h4>Module Chapters</h4>
          <ol className="chapter-list">
            {chapters.map((chapter, index) => (
<li key={index} >
                <button onClick={() => toggleChapter(index)}>
                  {chapter.title}
                </button>
                {expandedChapter === index && (
                  <div className="chapter-content">
                    {chapter.videoIds &&
                      chapter.videoIds.map((videoId, videoIndex) => (
                        <div key={videoIndex}>{renderVideoEmbed(videoId)}</div>
                      ))}
                    {chapter.audioUrl && (
                      <audio controls>
                        <source src={chapter.audioUrl} type="audio/mpeg" />
                        Your browser does not support the audio element.
                      </audio>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};

SubjectCard.propTypes = {
  name: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  code: PropTypes.string.isRequired,
  chapters: PropTypes.arrayOf(PropTypes.shape({
    title: PropTypes.string.isRequired,
    videoIds: PropTypes.arrayOf(PropTypes.string),
    audioUrl: PropTypes.string
  })).isRequired
};


const SubjectCardGrid = ({ selectedYear = 1 }) => {
  const year1Subjects = [
    {
      name: 'Introduction to Economics',
      description: 'Explore fundamental economic concepts and their impact on everyday life and decision-making',
      code: 'economics',
      year: 1,
      chapters: [
        { title: 'The Economic Problem', videoIds: ['W9IjktFC9Tg','IzccVWouIxM','YboSszwySzU','HneRNVtahYw','AebGGq5n3Ec','YtX6SGw7E3c','R4Pf1OQQTPY'] },
        { title: 'Supply and Demand', videoIds: ['b1QL1BZ7jJM','JcN4dBoerwc','r1Xq9FcxDB8','aKpsUBbD8jM','ROF15eoLkrg'] },
        { title: 'Elasticity', videoIds: ['QtQohZw_4Gg','AiIN0zXMVFc','hyMohEr3VIk'] },
        { title: 'Consumer Choice', videoIds: ['iFbnwKv2o7w','TkFJdeF2Ifo','pLhh_D5b_Lg'] },
        { title: 'The Firm', videoIds: ['5ISuhZw3PG4','m9bXUYwvx2c'] },
        { title: 'Perfect Competiton', videoIds: ['k0vSP8ayY0g'] },
        { title: 'Pure Monopoly', videoIds: ['E07bl-TUmmY','D7vYXago3-A'] },
        { title: 'Market structure and Imperfect Competition', videoIds: ['AoCVu3Tr2tk','ECMD9OAsBmQ','idFuhMRzr0Y'] },
        { title: 'The Labour Market', videoIds: ['_2Xi866KB8A'] },
        { title: 'Welfare Economics', videoIds: ['PC3qooaF5Xs','osvoVuESEKY'] },
        { title: 'Introduction to Macroeconomics', videoIds: ['qtNZSbzRP3A','ZdGnhusKnRU','iNfNZ1mIGRE'] },
        { title: 'Supply-side economics and economic growth', videoIds: ['PvfdPfEd-gk','ldszxyaFcHk','E3Niu4E1kbI','EUOcBo-gzdE','7yeWBFzGHS4','SAgt0oAv2FI','mHP8q-em1wo'] },
        { title: 'Output and aggregate demand (Playlist) skip to go to the next', videoIds: ['PL_o_l6j2TdmhF9DN-n3IIq5fTFmMTT14y'] },
        { title: 'Money and banking; interest rates and monetary transmission', videoIds: ['5dTvjezJz6s'] },
        { title: 'Monetary and fiscal policy', videoIds: ['FOzxImnSIAw','m6xo8gxMaCs','Kf8CTCFEldY','1xI0dDf58XM','0-pksf2Xfl4','P6JQI0Ki6Tk','V2bj1c2KYkQ','1nWhiVNXudk'] },
        { title: 'Aggregate demand and Aggregate supply', videoIds: ['xXNrloLHOzI','H2rtsMNbkIs','knRHiexdKe8','efQjQuqzDzM'] },
        { title: 'Inflation', videoIds: ['dOn2ey5_EYQ','eF2Xn7Ww2_M','dE0wIcaCVGE','ABOGxIHVHO4','uNpezr7XFcw','_TBxupIhsro','522lWzrot1c'] },
        { title: 'Unemployment', videoIds: ['J-Id_7of0GU','SfL3jefilPo'] },
        { title: 'Exchange rates and the balance of payments', videoIds: ['EiXYP93hvGQ','1Gs1KrTBIBM','zcyMQ_zuF1w','nGvv08etNDI',"DGRknAQNWIk","TuyPLN8VR1M","j2-q3Abvrzs","IUwB3xDgmFU","cg17YTtsk2U"] },
        { title: 'Open Economy Macroeconomics', videoIds: ["HSd7ybLJUuw"] },
      ]
    },
    {
      name: 'Business and Management',
      description: 'Examine key principles of business and managements.',
      code: 'Business',
      year: 1,
      chapters: [
        { title: 'Globalisation', videoIds: ['aguTvH4Tc-c'] },
        { title: 'Political, econmoic and legal evnvironments', videoIds: ['k1wbj3aXPsQ'] },
        { title: 'Informal Institutions', videoIds: ['9GFyMXHWo6w'] },
        { title: 'International Trade and Investment', videoIds: ['KROTqSzz4BQ'] },
        { title: 'Multilateral organisations and regional integration', videoIds: ['CkhdBMXcu0k'] },
        { title: 'Exchange Rates', videoIds: ['NQXwvmRgIf0'] },
        { title: 'Overview of Strategy and the Enterprise in International Context', videoIds: ['ldGfvoeq0IA'] },
        { title: 'Competitive Strategy for International Business', videoIds: ['c0XJDVKBBwc'] },
        { title: 'International Business Strategies: Market Entry and Growth', videoIds: ['SNjn9h3QVUk'] },
        { title: 'International Marketing and R&D Strategy', videoIds: ['nG2fesHT0Ss'] },
        { title: 'Global-Sourcing-Production', videoIds: ['u1pS_hwYkkc'] },
        { title: 'Global information systems management', videoIds: ['ADEyI7AvEcI'] },
        { title: 'International-Project-Management', videoIds: ['ngiDb1ugbnM'] },
        { title: 'International-Human-Resource-Man', videoIds: ['mubdwgK6Ss'] },
        { title: 'International Project Management', videoIds: ['AQwveBtsuyI'] },
        { title: 'Global Digital Management', videoIds: ['uJSwD5Vzbhk'] },
      ]
    },
    {
      name: 'Mathematical Methods',
      description: 'Delve into sophisticated mathematical theories and their real-world applications',
      code: 'mathematics',
      year: 1,
      chapters: [
        { title: 'Functions', videoIds: ['1EGFSefe5II', 'KyOQhC8ctxc', 'f-_UsIP5jyA', 'GsIo3B46yjU','ih01YszlraY','bowrJ31ojOg','m1OitPmkydY','JEIH5HeneXc'] },
        { title: 'Differentiation', videoIds: ['962lLfW-8Jo', 'EY6FHX6asU0', 'AvCQQ3X4Nuc', 'qr1WXiq3S3k' ,'RJJSiNz5oto','8dr1dZjfhmc','s7rd9YPJrNc','zmnh448y_ZU','FIbpibkywmk','2g8zJzMViXU','itkoiNNxNa4','fml0-ELYLaE']},
        { title: 'One Variable Optimisation', videoIds: ['Mx39JbbzEAo', 'nQ6tOORDQ3I', '29GbRaQxtzY', '-PYebK8DKPc','8u6woY05aL0','SWZcq_biZLw','qGCKjuhA4eQ','JZCg6zmrmDI'] },
        { title: 'The Art of Integration', videoIds: ['o75AqTInKDU', 'SVrn1tRtZmg', 'aiBD9aI69C8','t3rzxSgvZZk','zNU8iK8sGD0','2I-_SV8cwsw','KJGp0pyPoVo','qijx9zx3HNQ','UjTTx2eYrx8','DcfYmzt4jnY'] },
        { title: 'Functions of Several Variables', videoIds: ['nIJQPX5kxp4', 'acdX4YamDtU', 'CBgn0z0huW8','IXuu7szVnN8','EkZGBdY0vlg','tXryaM-mTpY','OBELQIPH5xY','J08-L2buigM','fZhHJdPjtYc'] },
        { title: 'Multivariate Optimisation', videoIds: ['kPL28zgEFk8','_Ffcr98c7EE','nUfYR5FBGZc','Ob56YXIV3rM'] },
        { title: 'Matrices and Linear Equations', videoIds: ['https://vc.bibf.com/playback/presentation/2.3/a5043fc46d3971f08c145ede6437f67fdeb24b60-1676264200087','https://vc.bibf.com/playback/presentation/2.3/4c7c05fd956e4e26aef314c126f07178e416dabe-1676350815340','TQvxWaQnrqI','WTLl03D4TNA'] },
        { title: 'differential equations', videoIds: ['EWVSxND_iWA','5LkQEOPwqfk','HjioXdmwze0','_4Bq6I68Yn4','WfX20b-peDw','ZWXG3c7A_9s','kATxKuVSc9I','fpQoL5u5ihs','UFWAu8Ptth0', "SPVqgkOZMAc",'UyCwAFQt4v0', "3uO_uPb9H8w", "6xEO4BeawzA","jJyRrIZ595c","rGaM6pwqhB0","NW9JfMvIsxw","znE4Nq9NJCQ", 'hbJ2o9EUmJ0', "I3vIAzMcm4Y",'vAepSNDLZRM',"YavFKipIeio",'yvFr5D7UAMQ'] },
        { title: 'difference equations', videoIds: ["YIoukM31_nI","Hk8Q0pd5G1s","yYbmY9N4SNs"] },
      ]
    },
    {
      name: 'Introduction to Mathematical Statistics',
      description: 'Master the art of data interpretation and predictive modeling',
      code: 'statistics',
      year: 1,
      chapters: [
        { title: 'Probability Theory', videoIds: ['https://vc.bibf.com/playback/presentation/2.3/985fd6c54dbe7e139c1c86a60304c7b18c82f606-1726548801542', 'https://vc.bibf.com/playback/presentation/2.3/7b9eb7f7dba2c8737fe8c658c07f0cc83d6b9176-1726736271504', 'https://vc.bibf.com/playback/presentation/2.3/f23f058bda0a399f33ed962e9406ad9a2ff955ba-1726981115673', 'https://vc.bibf.com/playback/presentation/2.3/97d19cc5cfa22d422046f8c33277c38d567c111e-1727153828299', 'https://vc.bibf.com/playback/presentation/2.3/4ea00ab33d08eb7103035f77dd958d783a742395-1727341013389','https://vc.bibf.com/playback/presentation/2.3/1e139c2089d0b1ba102b6ca80ee7a9b21ef67ab4-1727605984348'] },
        { title: 'Random Variables', videoIds: ['https://vc.bibf.com/playback/presentation/2.3/1ab1ae7381a6fcc1e3d8ea709204fd7e31a085ac-1727778272013','https://vc.bibf.com/playback/presentation/2.3/21023752c3eab8780f489dd8c5298e006878f34b-1727946137711','https://vc.bibf.com/playback/presentation/2.3/9d3bac605dea955b6533fde9301faa8e480d0fb8-1728210609891' ,'https://vc.bibf.com/playback/presentation/2.3/b3d7809b66aef56d8ab4594f897be4403ff86e17-1728383138486', 'https://vc.bibf.com/playback/presentation/2.3/d1d0f95143107da7ad7b1e95dd9cec11103f40e0-1728550959309', 'https://vc.bibf.com/playback/presentation/2.3/d26b5547690da25c7c95c9b6f9d883b8f02989db-1728815259448', ]},
        { title: 'Common Distributions of Random Variables', videoIds: ['https://vc.bibf.com/playback/presentation/2.3/0754a89ffc88893c6ad0cc4fe7b4439154f7111e-1728988079422','https://vc.bibf.com/playback/presentation/2.3/cc8c86ebe35fbbb9b38217614313e2841dcdb44a-1729155587247','https://vc.bibf.com/playback/presentation/2.3/b4e5534d626065c284710f5249839e6f12d8b62f-1729420169390' ,'https://vc.bibf.com/playback/presentation/2.3/94ffd40d5ebaa19edef4b22db42c07c279b70fe6-1729592969374', 'https://vc.bibf.com/playback/presentation/2.3/54bb14a2f0aa8f2233027114100b4f7e99153ed7-1729760497898', 'https://vc.bibf.com/playback/presentation/2.3/35aa8fdc99ebc6c514900e0d10d6475efc1e6f0c-1730024840073', ]},
        { title: 'Multivariate Random Variables', videoIds: ['https://vc.bibf.com/playback/presentation/2.3/0df66cc7e53dc62870d4381584838ba7b21d05c8-1730197717513','https://vc.bibf.com/playback/presentation/2.3/846144916551f3653e99f908903680fad1583c41-1730365402967','https://vc.bibf.com/playback/presentation/2.3/11e2dacc0511c1e020eeef6a222173b7f334b39c-1730630127389' ,'https://vc.bibf.com/playback/presentation/2.3/6d39771c4b9fdbcc3c08e75f027352da6009b3f6-1730802627532', 'https://vc.bibf.com/playback/presentation/2.3/16337a65f47375ab28ccb54ad0bdeff14b4b5fa8-1730969965689', 'https://vc.bibf.com/playback/presentation/2.3/0ed04dc535441cd50b10300abd8d4e0afba73d1d-1731234443655', ]},
        { title: 'Sampling Distributions of Statistics', videoIds: ['https://vc.bibf.com/playback/presentation/2.3/64bddc04337fece09731382d9f340e0219e56235-1731407439809','https://vc.bibf.com/playback/presentation/2.3/7c6f164ecef9064640826013840f2d036d13902d-1731574681618',  'https://vc.bibf.com/playback/presentation/2.3/3838daca2e90dfd6281ded175bc56cdd1260bd42-1731839386070','https://vc.bibf.com/playback/presentation/2.3/1c87689f2c56832f0c2b4a1744c80c563a3aedc7-1732012416076','80ffqpZdKiA','UetYS3PaHIo','G_RDxAZJ-ug','https://vc.bibf.com/playback/presentation/2.3/39b3715d9e88d5df9c391827aadcfa9844b7a264-1732444516154',"https://vc.bibf.com/playback/presentation/2.3/c0b7acbeb8c3b0ffc38afd3f83b9fc61da015210-1737628152762"]},
        { title: 'Point Estimation', videoIds: ['https://vc.bibf.com/playback/presentation/2.3/39b3715d9e88d5df9c391827aadcfa9844b7a264-1732444516154','https://vc.bibf.com/playback/presentation/2.3/faf83674afb98c2c185125de50da28a934eb321e-1732616975026','https://vc.bibf.com/playback/presentation/2.3/bb09f31166f480a627ecc2a0db1da942d98077ec-1733048490844','https://vc.bibf.com/playback/presentation/2.3/d1369d3c0416edd63fad598b935d1073b1304e8f-1733221687080','D1hgiAla3KI']},
        { title: 'Interval Estimation', videoIds: ['https://vc.bibf.com/playback/presentation/2.3/c035537d6d80583264e9a051ea5a34c5d28654af-1733653795927','https://vc.bibf.com/playback/presentation/2.3/f62fa560cba372898a14413bade50ab996365917-1733826609321']},
        { title: 'Hypothesis Tests', videoIds: ['https://vc.bibf.com/playback/presentation/2.3/cfd64087a22d227928487362fe4d6c10b7daee0a-1736245614039','https://vc.bibf.com/playback/presentation/2.3/b334e6e8f6f1416bba7f4233c8c9f028b443ffbd-1736677681258','https://vc.bibf.com/playback/presentation/2.3/6be55e03b52ca232ecf424cf8623d8b56e440e42-1736850586218','https://vc.bibf.com/playback/presentation/2.3/c05682f13539e48f8d5130b486e0c3ee5e1155ed-1737282756347','https://vc.bibf.com/playback/presentation/2.3/9a088976eef7fd2ab095f05e71d29deeb4cbb0cc-1737455532609','https://vc.bibf.com/playback/presentation/2.3/c0b7acbeb8c3b0ffc38afd3f83b9fc61da015210-1737628152762']},
        { title: 'Anova', videoIds: ["https://vc.bibf.com/playback/presentation/2.3/fffbdb6876b5d7f107ac568dee4d11cad53d656d-1738665051066","https://vc.bibf.com/playback/presentation/2.3/6e912f7d532e2fbc50da2e22068e401a7bb0e69d-1738837727859"]},
        { title: 'Linear Regression', videoIds: ["https://vc.bibf.com/playback/presentation/2.3/ba0835a6894106f047020819044cce905bb76a34-1739096839644",'https://vc.bibf.com/playback/presentation/2.3/c40967d7c7dea42181a6906aaa922d49f8a4b2be-1739269923481','https://vc.bibf.com/playback/presentation/2.3/ad6cd478b20127be9ab7e58609ae43f7dae284c7-1739442771751','https://vc.bibf.com/playback/presentation/2.3/427f00e2db559c264111024083de8ff57c262e5e-1739701688696','https://vc.bibf.com/playback/presentation/2.3/71c3d17d81d8b494e1b4964ba47faeff9d12b2df-1740306319710','https://vc.bibf.com/playback/presentation/2.3/de69448ae26c52ed01d9b99dcab3e38fb0a9e14c-1740479374347']},
      ]
    },
  ];

  const year2Subjects = [
    {
      name: 'Advanced Statistics Distribution Theory',
      description: 'Deep dive into advanced statistical distribution theories and their applications',
      code: 'advanced_stats_distribution',
      year: 2,
      chapters: [
        { title: 'Probability Space (Press watch on Youtube if it does not work)', videoIds: ["wgV0rjJqpqI","u5IouBwYji4","xZ69KEg7ccU","z5m6HXKx0Wo","7O7qPrNIt7w","nPK62LCNVcQ","3lmEqp8VhAU","XJnIdRXUi7A","N_QU1BiW6sI",'https://vc.bibf.com/playback/presentation/2.3/1e139c2089d0b1ba102b6ca80ee7a9b21ef67ab4-1727605984348'  ] },
      ]
    },
    {
      name: 'Advanced Statistics Inferential Statistics',
      description: 'Master advanced statistical inference techniques and hypothesis testing',
      code: 'advanced_stats_inferential',
      year: 2,
      chapters: [
      ]
    },
    {
      name: 'Programming for Data Science',
      description: 'Learn programming languages and tools essential for data science applications',
      code: 'programming_data_science',
      year: 2,
      chapters: [
        { title: 'R for Data Science', videoIds: ["_V8eKsto3Ug"] },
        { title: 'Python for Data Science', videoIds: ["wUSDVGivd-8"] },
        { title: 'Git', videoIds: ["8JJ101D3knE&t=2170s"] },
        { title: 'Sql', videoIds: ["7mz73uXD9DA"] },

      ]
    },
    {
      name: 'Business Analytics',
      description: 'Apply analytical methods to solve complex business problems and drive decision-making',
      code: 'business_analytics',
      year: 2,
      chapters: [
      ]
    },
    {
      name: 'Econometrics',
      description: 'Study economic relationships using statistical methods and mathematical models',
      code: 'econometrics',
      year: 2,
      chapters: [
      ]
    },
    {
      name: 'Information System',
      description: 'Understand information systems design, implementation, and management in organizations',
      code: 'information_systems',
      year: 2,
      chapters: [
      ]
    },
  ];

  const subjects = selectedYear === 1 ? year1Subjects : year2Subjects;

  return (
    <div className="subject-grid">
      {subjects.map((subject, index) => (
        <SubjectCard 
          key={index}
          name={subject.name}
          description={subject.description}
          code={subject.code}
          chapters={subject.chapters}
        />
      ))}
    </div>
  );
};

export default SubjectCardGrid;
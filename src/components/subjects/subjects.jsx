import './SubjectCards.css';
import PropTypes from 'prop-types';
import { useState, useEffect } from 'react';

const YEAR2_ANNOUNCEMENT_KEY = 'year2_new_notes_announcement_v1';

const Year2AnnouncementPopup = ({ onClose }) => {
  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '16px',
  };
  const modalStyle = {
    backgroundColor: '#fff',
    color: '#222',
    borderRadius: '12px',
    padding: '24px 28px',
    maxWidth: '480px',
    width: '100%',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
    fontFamily: 'inherit',
    position: 'relative',
  };
  const closeBtnStyle = {
    position: 'absolute',
    top: '10px',
    right: '14px',
    background: 'transparent',
    border: 'none',
    fontSize: '22px',
    cursor: 'pointer',
    color: '#666',
    lineHeight: 1,
  };
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <button style={closeBtnStyle} onClick={onClose} aria-label="Close">×</button>
        <h2 style={{ marginTop: 0, marginBottom: '12px' }}>📢 New Year 2 Study Notes</h2>
        <p style={{ marginBottom: '12px' }}>New student notes have been added:</p>
        <ul style={{ paddingLeft: '20px', marginBottom: '16px', lineHeight: 1.6 }}>
        </ul>
        <button
          onClick={onClose}
          style={{
            backgroundColor: '#1a73e8',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: 600,
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
};
Year2AnnouncementPopup.propTypes = {
  onClose: PropTypes.func.isRequired,
};

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
  information_systems: '💾',
  machine_learning: '🤖',
  market_research: '🔍',
  microeconomics: '📉',
  asset_pricing: '💰',
  marketing_management: '📣',
  further_maths_economists: '🧮'
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
    machine_learning: 'https://drive.google.com/drive/folders/1L-t8lQegkEzglFVPEX3NybaWvI0faVX9',
    market_research: 'https://drive.google.com/drive/folders/1qkJhwLxi-lQpJEh55xiIEOOpLT10XP89',
    microeconomics: 'https://drive.google.com/drive/folders/1yT9qq6krw9r2WhAt_3ihW3jxrU_MdFWc',
    asset_pricing: 'https://drive.google.com/drive/folders/10WkXNxJG7nWL9DICHgdVAj5xi9bS1WtN',
    marketing_management: 'https://drive.google.com/drive/folders/1P3iHqYSe4qPwVRW6baj475Rsi_mpbP2h',
    further_maths_economists: 'https://drive.google.com/drive/folders/1a6lakhRK3st9DRRGlGKPiCKNaTGoczIR',
  };

  const studentsNotesLinks = {
    mathematics: [
    ],
    statistics: [
      { name: 'Nasser', link: 'https://drive.google.com/drive/folders/1qcIgZ8MzS_2IyIICyCY6JChfHJj4OsCi' },
      { name: 'Mariam Nasser', link: 'https://drive.google.com/drive/folders/1dvdGf86_7AyhMuxNzzd7ORnG4QIH_BmV' },
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
    advanced_stats_distribution: [      { name: 'Mohamed study guide', link: 'https://drive.google.com/file/d/1T0enLYVk9CZhcnYOhsXRwpP2IU9V45mG/view?usp=drive_link' },
],
    advanced_stats_inferential: [      { name: 'Product and Sigma Notaion', link: 'https://drive.google.com/drive/folders/1bl81qDEuqa34zs4UzZoBvGT0OrvjHPnm' },
],
    programming_data_science: [],
    business_analytics: [{ name: 'Mohamed', link: 'https://drive.google.com/file/d/1hq0iMegUQ1zq-zAkSuZyCt06g9Vrf68y/view?usp=drive_link' }],
    econometrics: [],
    information_systems: [
            { name: 'Mahdi', link: 'https://drive.google.com/drive/folders/1HbOmDlowIBqImfoWlN7ss2EOImXtMxxM' },

    ],
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
    machine_learning: 'https://drive.google.com/drive/folders/1003IX08HxK09WOpjTV5dQC38ccR7ROt2',
    market_research: 'https://drive.google.com/drive/folders/13HgN5BskOB3nuB6TNDpHjkX4h7ccMRk7',
    microeconomics: 'https://drive.google.com/drive/folders/1oCLFiXjm8tVq_TTatSn6zFq0EfNCOAf6',
    asset_pricing: 'https://drive.google.com/drive/folders/1pyaBciV2CtsBHuPUTKa8u_TKSQgCDWwa',
    marketing_management: 'https://drive.google.com/drive/folders/1w3pG9SwQu4URKUkNU7Igf8ym56BqVbGl',
    further_maths_economists: 'https://drive.google.com/drive/folders/1WwhnK5Z_lUdtWWDGo1DllnAzfPVs4hrF',
  };

  const cheatSheetLinks = {
    programming_data_science: 'https://docs.google.com/document/d/1fiO4uLqivuYNF_SPDIYxiXClRDWwlI9U/edit?usp=drive_link&ouid=114257845455063086777&rtpof=true&sd=true',
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

  const materialsLink = subjectMaterialsLinks[code];
  const notes = studentsNotesLinks[code] || [];
  const exerciseLink = subjectExerciseLinks[code];
  const vleLink = vleLinks[code];
  const olderExamsLink = paidExamsLinks[code];
  const cheatSheet = cheatSheetLinks[code];
  const hasExercises =
    code === 'mathematics' || code === 'statistics' || (exerciseLink && exerciseLink !== '#');
  const hasResources =
    Boolean(materialsLink) ||
    notes.length > 0 ||
    Boolean(hasExercises) ||
    Boolean(vleLink) ||
    Boolean(olderExamsLink) ||
    Boolean(cheatSheet) ||
    chapters.length > 0;

  return (
    <div className="subject-card">
      <div className="subject-card-content">
        <div className="subject-icon">
          {subjectIcons[code] || '📚'}
        </div>
        <h3 className="subject-title">{name}</h3>
        <p className="subject-description">{description}</p>

        <div className="subject-sections">
          {materialsLink && (
            <>
              <h4>Books and Study Guide</h4>
              <a
                href={materialsLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Access Materials
              </a>
            </>
          )}

          {notes.length > 0 && (
            <>
              <h4>Students Notes</h4>
              <ul>
                {notes.map((student, index) => (
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
            </>
          )}
          {hasExercises && <h4>Exercises</h4>}
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
) : !hasExercises ? (<></>) : (
  <a
    href={exerciseLink}
    target="_blank"
    rel="noopener noreferrer"
    className="subject-link"
  >
    Access Exercises
  </a>
)}

          {(vleLink || olderExamsLink) && <h4>Previous Exams</h4>}
          {vleLink && (
            <div>
              <a
                href={vleLink}
                target="_blank"
                rel="noopener noreferrer"
                className="subject-link"
              >
                Access VLE Exams
              </a>
            </div>
          )}
          {olderExamsLink && (
            <div>
              <a
                href={olderExamsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="subject-link"
              >
                Access Older Exams
              </a>
            </div>
          )}
          {cheatSheet && (
            <div>
              <h4>Cheat Sheet</h4>
              <a
                href={cheatSheet}
                target="_blank"
                rel="noopener noreferrer"
                className="subject-link"
              >
                Access Cheat Sheet
              </a>
            </div>
          )}

          {!hasResources && (
            <p className="subject-empty">
              Resources for this module are being added. Check back soon.
            </p>
          )}

          {chapters.length > 0 && <h4>Module Chapters</h4>}
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
        { title: 'Probability Space', videoIds: ['PegyQkhbh0c','swa1VRYms3Q','lsHr3Y9-PCA','DqGUwoz4d4M','ptVgsHPAZ-4','nPK62LCNVcQ','V3pnr5gmJC8','3lmEqp8VhAU','XJnIdRXUi7A','N_QU1BiW6sI','MPRKc4UPoJk','L_pEeYLGaP0','8odFouBR2wE','kz2tvO_ZAKI','HZGCoVF3YvM','UbQcqFH33G0','aJXfyfQs2Mc'] },
        { title: 'Random variables and univariate distributions', videoIds: ['vfqPpai_9jI','4QeL1ma_XJ0','Uks98M-dxqM','bT1p5tJwn_0','qIzC1-9PwQo','zq9Oz82iHf0','BPlmjp2ymxw','L2KMttDm3aY','jmqZG6roVqU','J3KSjZFVbis','6UMv4vb4y7c','gIsoceE4vhg','juF3r12nM5A','TwvXhX3bJJM','ISaVvSO_3Sg','vjYanZ1nsZg','mlelI1LA9o4','GDJFLfmyb20','N8O6zd6vTZ8','vp7_Tfrej00','PaI-oaOBHKU','XwrnUw6g1dA','l_YZ096WH74','ZKqzA81Nz2Y'] },
        { title: 'Multivariate distributions', videoIds: ['J70dP_AECzQ','IujCYxtpszU','eO2-m8Gqzjk','5rF19EitOss','yXwPUAIvFyg','sktbYva958A','IaSGqQa5O-M','MF-XSJOsGqw','2xHeg6n89tU'] },
        { title: 'Conditional distributions', videoIds: ['Kj6iEzXsFkI','2LR5JYbhyjg','PgawcWisb0I','gjBvCiRt8QA','mHonq7Gjjqg','OPfmUh06xsI','xdewLsXI_UQ','SgM16HNeC3o','I1Exxswt7d4'] },
      ]
    },
    {
      name: 'Advanced Statistics Inferential Statistics',
      description: 'Master advanced statistical inference techniques and hypothesis testing',
      code: 'advanced_stats_inferential',
      year: 2,
      chapters: [
        { title: 'Fundamentals of statistical inference', videoIds: ['5j4E2FRR384','J-TTqCgRzbM','IsgteDaNTFk','ScduwntrMzc','pneluWj-U-o','3r5Hb3OINQc'] },
        { title: 'Point Estimation', videoIds: ['YJRHmv6OpWQ','lET4uQLpmM0','QEdmE-aO4_M','D1hgiAla3KI','V4Rm4UQHij0','cHRdyed4-yc','OL8kf-gKcqI','T_tjvTI70lo','RZ511cB-BB8','cd-1fYpAzSg','7kLHJ-F33GI','45lb8Xwm1E4'] },
        { title: 'Confidence Intervals', videoIds: ['EJe3jiZNwUU','p8SgfPHd5dk','-iYDu8flFXQ','bFefxSE5bmo','q-cHZyOs5DQ','DyLWP5Zx934','cxUWQCwxQgk'] },
        { title: 'Hypothesis Testing', videoIds: ['aepZRBL1Abg','7mE-K_w1v90','UsU-O2Z1rAs','Ksk0Z0VwzrQ','zFBfs01zTnM','GnIk8NPQmYc','uNh4N3IToV4','SC10j5YZ2es','ToSSaZuWXtw','yzO80fa0_Y4'] },
      ]
    },
    {
      name: 'Business Analytics',
      description: 'Apply analytical methods to solve complex business problems and drive decision-making',
      code: 'business_analytics',
      year: 2,
      chapters: [
        { title: 'good Excel course', videoIds: ["kghcAk7l6eA"] },
        { title: 'good Tableau course', videoIds: ["dahrmqT5GD4"] },
        { title: 'Block 1: Decision-Making Under Uncertainty and Modelling', videoIds: [
          "UgKrQ2ywVfs",
          "HZGCoVF3YvM",
          "M-z74nAun40",
        ] },
        { title: 'Block 2: Descriptive Statistics', videoIds: [
          "SplCk-t1BeA",
          "zjHfAhcU6kE",
          "U0NZu6f5TMI",
        ] },
        { title: 'Block 3: Exploring Relationships Between Variables', videoIds: [
          "Rwc4-MXl8VI",
          "D7NKvMG8peo",
          "IujCYxtpszU",
        ] },
        { title: 'Block 5: Probability and Probability Distributions', videoIds: [
          "94AmzeR9n2w",
          "OByl4RJxnKA",
          "-7QG2itL1u4",
        ] },
        { title: 'Block 6: Common Probability Distributions', videoIds: [
          "CjF_yQ2N638",
          "3PWKQiLK41M",
          "m0o-585xwW0",
        ] },
        { title: 'Block 7: Decision Trees and EMV', videoIds: [
          "NQ-mYn9fPag",
          "tbv9E9D2BRQ",
          "ydvnVw80I_8",
          "FUY07dvaUuE",
        ] },
        { title: 'Block 8: Sampling and Sampling Distributions', videoIds: [
          "pTuj57uXWlk",
          "7S7j75d3GM4",
          "YAlJCEDH2uY",
        ] },
        { title: 'Block 9: Confidence Interval Estimation', videoIds: [
          "6r5IZCjvIHI",
          "dLEtlteLVJU",
          "hlM7zdf7zwU",
        ] },
        { title: 'Block 10: Hypothesis Testing', videoIds: [
          "VK-rnA3-41c",
          "0oc49DyA3hU",
          "UcZwyzwWU7o",
        ] },
        { title: 'Block 11: Simple Linear Regression', videoIds: [
          "owI7zxCqNY0",
          "aq8VU5KLmkY",
          "P8hT5nDai6A",
        ] },
        { title: 'Block 12: Multiple Regression Analysis', videoIds: [
          "EkAQAi3a4js",
          "G1WX5GiFSWQ",
          "S66FZa16RZc",
          "Cba9LJ9lS8s",
        ] },
        { title: 'Block 13: Time Series Analysis and Forecasting', videoIds: [
          "GE3JOFwTWVM",
          "Wo5YWXDRXv8",
          "k_HN0wOKDd0",
          "C5J_QSR7ST0",
        ] },
        { title: 'Block 14: Optimisation Models', videoIds: [
          "soTnusib1l8",
          "FzY333RdrBM",
          "J52iRkbrG1k",
          "uaxOfTIC_pI",
        ] },
        { title: 'Block 15: Monte Carlo Simulation', videoIds: [
          "7TqhmX92P6U",
          "-Mp4CdDaoUE",
          "Eb4jPVdaITg",
        ] },
      ]
    },
    {
      name: 'Econometrics',
      description: 'Study economic relationships using statistical methods and mathematical models',
      code: 'econometrics',
      year: 2,
      chapters: [
        {title: 'Nature of Econometrics and Economic Data', videoIds: ["5lcQN-zbeGE"]},
        {title: 'The Simple Regression Model', videoIds: ["WHas2yaIlcs"]},
        {title: 'Multiple Regression Analysis: Estimation', videoIds: ["17nWWWUrUcg"]},
        {title: 'Inference', videoIds: ["S72V6trrwKY"]},
        {title: 'OLS Asymptotics', videoIds: ["nORu6KPc7o4"]},
        {title: 'Heteroskedasticity', videoIds: ["DMzBRYqAHrE"]},
        {title: 'Time series', videoIds: ["EhvPfZYJCkE" ]},
        {title: 'Instrumental variables estimation', videoIds: ["GsL3OZTIcfo"]}
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

  const year3Subjects = [
    {
      name: 'Machine Learning',
      description: 'Study supervised and unsupervised learning methods, and how models are trained and evaluated',
      code: 'machine_learning',
      year: 3,
      chapters: [
        { title: 'Full course: Stanford Statistical Learning (ISLR)', videoIds: ['PLoROMvodv4rOzrYsAxzQyHb8n_RWNuS1e'] },
        { title: 'Topic 1: Introduction to Machine Learning Concepts', videoIds: ['ox0cKk7h4o0','pvcEQfcO3pk','EuBBz3bI-aA','zUJbRO0Wavo','fSytzGwwBVw','AMfvd_hLssE','jgoa28FR__Y','jzKSAeJpC6s'] },
        { title: 'Topic 2A: Frequentist Inference (Likelihood, MLE, CIs, Tests)', videoIds: ['YevSE6bRhTo','Dn6b9fCIUpM','lET4uQLpmM0','QVF0oOh7s8c','27iSnzss2wM','tTeMYuS87oU','vemZtEM63GY'] },
        { title: 'Topic 2B: Linear Regression and Inference for Regression', videoIds: ['vCHtY6Me5FI','3GiWpRfkSjc','o9hoLdylWKo','50sv4UTjE90','dEBQmiXv9fk','TSFMepJbHa0','_-Gnu498s3o','iMdtTCX2Q70'] },
        { title: 'Topic 3: Bayesian Inference', videoIds: ['3jP4H0kjtng','GqSX-8AQL90','mqq_pjwUp40','wMfODgwqEr0','T-kMpA4z-7k','R9NQY2Hyl14','MKnjsqYVG4Y','MgJnjo5Aayc'] },
        { title: 'Topic 4: Shrinkage Methods and Model Selection', videoIds: ['nsv5rEV3mVI','ynXq-Gw1xfE','Q81RR3yKn30','NGf0voTMlcs','Xm2C_gTAl8c','1dKRdX9bfIo','KV1Kt6I8rYs','Z6HGJMUakmc'] },
        { title: 'Topic 5A: Classification - Logistic Regression, Gradient Descent, Newton-Raphson', videoIds: ['yIYKR4sgzI8','kr_Be9NVXOM','1uJVE8bkabc','BfKanl1aSG0','sDv4f4s2SB8','W7S94pq5Xuo','45lb8Xwm1E4'] },
        { title: 'Topic 5B: Classification - LDA, QDA, Naive Bayes, Evaluation, NLP', videoIds: ['oJc2r246VoQ','14JVlzWHKgk','aUlTqhDtpnw','giCZkipHEmA','O2L2Uv9pdDA','Kdsp6soqA7o','4jRBRDbJemM','Zw3L-0ZP_DA'] },
        { title: 'Topic 6: Unsupervised Learning', videoIds: ['kpuQqOzQXfM','FgakZw6K1QQ','WV_jcaDBZ2I','lJ0cXPoEozg','4b5d3muPQmA','7xHsRkOdVwo','yktzn-Mr2Nw','qMTuMa86NzU'] },
        { title: 'Topic 7: Regression and Classification Trees', videoIds: ['QNnayf--_yk','JaoTOfTNOVk','gLcfKSMKOb0','_L39rN6gz7Y','g9c66TUylZ4','D0efHEJsfHo'] },
        { title: 'Topic 8: Ensemble Learning', videoIds: ['sN5ZcJLDMaE','_cKAxjnInfA','0LB1cy2sCXc','J4Wdy0Wc_xQ','cdl4C2eCOHk','LsK-xG1cLYA','3CC4N4z3GJc','xtTyEoJ31Vg'] },
        { title: 'Topic 9: Neural Networks', videoIds: ['4Gac5I64LM4','aircAruvnKk','jJb2qytbcNg','IHZwWFHWa-w','vMh0zPT0tLI','Ilg3gGewQ5U','tIeHLnjs5U8','07zslA8BXZY'] },
        { title: 'Topic 10: Learning Functions - Splines, Kernels, Gaussian Processes', videoIds: ['FrVaxvwCLYM','b_HSFOnrGLI','wBVSbVktLIY','J4rRXd9UL-A','UBDgSHPxVME','R-NUdqxKjos','4vGiHC35j9s','qKSK3P-UZ_g'] },
      ]
    },
    {
      name: 'Statistical Methods for Market Research',
      description: 'Apply statistical techniques to survey data and consumer research problems',
      code: 'market_research',
      year: 3,
      chapters: [
        { title: 'Full course: Marketing Research and Analysis lectures (NPTEL)', videoIds: ['PLPjSqITyvDeWBBaFUbkLDJ0egyEYuNeR1'] },
        { title: 'Week 1: Introduction and Defining the Market Research Problem', videoIds: ['U8tQnSx5fHo','b4us4bNwAsc','ABLHV5Ce6TI','CtZmWrkIsvI','93Rio-HOeWQ'] },
        { title: 'Week 2: Research Design', videoIds: ['MYJWFBHdx2s','FlBFdEgrTBM','Ink4ehYLmqw','1Vi49F2q99o','hc6fv0uNgFI','5vIeDCcApc8'] },
        { title: 'Week 3: Internal Secondary Data and Analytics', videoIds: ['rT0WLkOVHzA','K3UaIQN_YXI','QjRTLJuh33I','Zforx36uKWE','uRPkZXAphxw','ZCTdpgnNCzM'] },
        { title: 'Week 4: Qualitative Research - Focus Groups and Projective Techniques', videoIds: ['XicAkp6TnNU','3TwgVQIZPsw','04ZuLhanhis','k2MEaNMmnLQ','Pb3UlqAMwKA','4pfJGtC-Ix4','Wj2wCiOi1Cc'] },
        { title: 'Week 5: Survey and Quantitative Observation Techniques', videoIds: ['9cuOyAR-Y9I','eRK_dXay5HY','13O4B0gPC4M','zrv-PsjzPKw','QcK-XWS-f3M','Hatmm84sqm0','ErfUVt0fyK0'] },
        { title: 'Week 6: Causal Research Design - Experimentation', videoIds: ['wxWTimkOMrM','W-Zb5xO28UE','J2584pDVBm0','eNPz6lIV7fA','E7zkaMeFQRE','DavsDxgYQo4','3N-DKY09GM4','iI4IeaaE-7A'] },
        { title: 'Week 7: Measurement and Scaling', videoIds: ['5Yh-9xdJzAs','GVmQpGn-Zuo','Y84nA2lv378','Tf_71r1Ve5w','kIg3YRqoh5s','RmZwXXsv3M8','oE71Onl5K-s','PCztXEfNJLM'] },
        { title: 'Week 8: Questionnaire Design', videoIds: ['hDD-VcjTgDU','Zx40lHPHopk','eFzGdQrr2K8','Iq_fhTuY1hw','FkX-t0Pgzzs','zYX8Ycm9vQE'] },
        { title: 'Week 9: Sampling - Design and Procedures', videoIds: ['fSmedyVv-Us','15UxDwpIIig','Jd-KqGDaJ3o','hhkxRfxdX58','WakK8Wzmw6o','TtcCvy-CKLc','T9dmq6Lwh24','RKSld_j2m5U'] },
        { title: 'Week 10: Sampling - Determining Sample Size', videoIds: ['yKr9w4e8eSw','KG921rfbTDw','7zcbVaVz_P8','mmgZI2G6ibI','QHzMPzHQgEg','5a_cf21f6N4','rk6jtkpad_E'] },
        { title: 'Week 11: Getting Started with SPSS', videoIds: ['8VXmkB4fTmM','9hn-1fky7I8','_zFBUfZEBWQ','bapuGcjwiLQ','4DbS2NmmQyI','YCys8qbLFcA','77XQQrtgUZ8'] },
        { title: 'Week 12A: Cross-Tabulation and Chi-Square', videoIds: ['tTeMYuS87oU','L1QPBGoDmT0','lvB0HHoihVA','LUuLGLGI650','J46LRDkXRng','ohquDY3fZqk'] },
        { title: 'Week 12B: Hypothesis Tests - t-Tests and Non-Parametric Tests', videoIds: ['NaZBdj0nCzQ','upc4zN_-YFM','E7F5-rmQ4kM','IcLSKko2tsg','LcxB56PzylA','NZsL2eDQiDQ','ZO2RmSkXK3c'] },
        { title: 'Week 13: Analysis of Variance and Covariance', videoIds: ['QUQ6YppWCeg','fFnOD7KBSbw','zV7OCPdIVus','lZFmFuZGQTk','PngndHgZOgY','8tV_OoG3LDo','l86wEhUzkY4','CBXYxs9pLW8'] },
        { title: 'Week 14: Correlation and Regression', videoIds: ['Mf0NxCs5HRw','OpAf4N582bA','KsVBBJRb9TE','zITIFTsivN8','WQeAsZxsXdQ','O4jDva9B3fw','s7EyQwJahgw','AdFT17sq53s'] },
        { title: 'Week 15: Discriminant Analysis', videoIds: ['azXCzI57Yfc','vnHkTnRFdAU','pkCgLstMxJI','vm1OLoL_VuY','70vGOdEvYaM'] },
        { title: 'Week 16: Logit Analysis', videoIds: ['yIYKR4sgzI8','vN5cNN2-HWE','yPCQZeGWJjw','fJ53tIDbvTM','xxFYro8QuXA','Ak_t86zm_sQ','4vwg98ELS_M'] },
        { title: 'Week 17: Factor Analysis', videoIds: ['WV_jcaDBZ2I','uvRgMnyon2Y','NHrNVEIHPBY','HoVrruVotho','pRA3Wapx7fY','g_3kaSnq-DY','b14wRuKVvzk'] },
        { title: 'Week 18: Cluster Analysis', videoIds: ['UrqLTkDHwkY','esHdKLt4_Ks','7xHsRkOdVwo','vg1w5ZUF5lA','4b5d3muPQmA','3BzfOLnIY9w','U6a2UaaWiH4','wdVtiVx_mAk'] },
        { title: 'Week 19: Conjoint Analysis', videoIds: ['dAucTNXEzhU','yiRNcHU2ZGU','Wum3_Y0AO4A','DOIhSW38P-Q','LZ1aMpidn0Y','_TSjdIIPeoo'] },
        { title: 'Week 20: Multidimensional Scaling', videoIds: ['xJUrBylId7I','L9hgJ-4hLYg','GEn-_dAyYME','NPcwjc6Oh7k','o1Z_tQh043k','r-JbmRgn3ag'] },
      ]
    },
    {
      name: 'Microeconomics',
      description: 'Analyse consumer and firm behaviour, market structures, and welfare in depth',
      code: 'microeconomics',
      year: 3,
      chapters: [
        { title: 'Consumer theory', videoIds: ['tCKk22kaZi4','5Af7M2xEa4A','x0scPosOsoI','lq9w2qyNk1A','ABXlkPmnjN4','aDeI5meKDjk','CrWqGe7h34E','BUnUOv_INyM'] },
        { title: 'Choice under uncertainty', videoIds: ['a9Uz7tXETq4','zrXWSXmOVFA','aEII9Fkvk48','Bem5kR0zu0M','aqEz6kvXhc8','KUGJhiAU_7I','kKyCf50CGGo'] },
        { title: 'Game theory', videoIds: ['O8T9spKHVWQ','stzPcqmyhI4','aa8USttcDoE','7oASpaBdDMs','hSYXkDnCpHM','D7aDIZ-KPEU','8jBouAQt9EY','a8QAcwNcJPU'] },
        { title: 'Production, costs and profit maximisation', videoIds: ['ftmvsahQ6Wo','8SkqltGoWqw','QkXyvqq5Jns','UHvMlTZJbZo','GbBQ3i1K2DE','TSYNHb6YBEE','G7KnsA0ZF7w','mwoDOrz-4IY'] },
        { title: 'Perfect competition in a single market', videoIds: ['_POik0fJpsY','BNy84DCRxzo','F0ulAkrfvzo','yrRysbDoyhw','dbuU8S1x0Ro','Q4FxNAacEB4','iL6N9oaF1yE','xHIKWqBj7kU'] },
        { title: 'General equilibrium and welfare', videoIds: ['oMjhRcXl5NE','qnJRFtLt9hM','XRR-iouyOYg','Fuyshwxs1Ig','QdhUiU063jg','IrSgLJBqCSo','gyhMBqdnbDo','XazAuoyCbx0'] },
        { title: 'Monopoly', videoIds: ['FJVOh57UxL8','ufrYzoR_4xE','wUgrFSrMWQU','mvPHvwgwHHE','mFlNxRV9OZo','VBwlyTN6vlw','MmGYldezp40','7CrlqeMwP4M'] },
        { title: 'Oligopoly', videoIds: ['0kA91PvS3sk','An_2r6Ae_28','P0N1RteWiEQ','L-QjAluq_fo','LMCODkeeDtE','PQTN3MXTRPw','YrnqUPW96lY','CkVi3LIl74g'] },
        { title: 'Asymmetric information: adverse selection', videoIds: ['hm5zqBPsRJM','S08DrcQ5fx0','BcEIZm5vTQw','TgpV3F1gSRY','lEVbbGxe0r0','O7RgNPbFiH0','VddaoIIIHMs','f92OLDTk74g'] },
        { title: 'Asymmetric information: moral hazard', videoIds: ['5v7TWKlYoN0','Nm0wV0CenWY','kdXqwucFNeU','L28dEHpZ7-M','gpD19ZPoZhk','LIpEXogDHsA','5tGh7wd2zOU'] },
        { title: 'Externalities and public goods', videoIds: ['BvwqdFWsw9A','DuUNNvlo3UU','RIugTo0ivWI','9tUb3MDrgEc','CC2wf39PmSg','sV0tI_ll8Ws','GGzSdqIkkjU','io88vTQO_g4'] },
      ]
    },
    {
      name: 'Principles of Asset Pricing',
      description: 'Examine how financial assets are valued and how risk and return are related',
      code: 'asset_pricing',
      year: 3,
      chapters: [
        { title: 'Review of time value of money', videoIds: ['U03Md5enU-0','RU-osjAs6hE','rViT_ODg5Yk','bIIndFa0RCM','S27jP4XUarY','88-B0vXTTIU','Q7_eqf0Vd1Q','o5QRdHH8aeQ'] },
        { title: 'Fixed income - Part 1: spot rates, no-arbitrage pricing and the term structure', videoIds: ['hyc8h5T76BE','b_cAxh44aNQ','mNxFjtTyXZI','CAs_aX95tVQ','aOw7_pEHVZM','8_8g3Zw3Lg0','SNehgIhigek','yrmqYNvvIzs'] },
        { title: 'Fixed income - Part 2: yield to maturity, duration and corporate bonds', videoIds: ['I7FDx4DPapw','BqFc3iosyqQ','F7XnR7sKWiE','rdDfmlerTcI','9GOfBq5Go9U','AtT59jxU9es','rBWBUKZd4WY','tkGepWJ5b3E'] },
        { title: 'Stock valuation', videoIds: ['QqK6H1JPjv0','TlH3_iOHX3s','Wh5vp-UkCpo','n6Kgg6e5iVw','21STUhQ-iP0','o0iNxizilow','cny-1yDbQno'] },
        { title: 'Portfolio theory and the CAPM', videoIds: ['tCreeXzCNRc','9gpbCi1g7w4','qPu4TEGIDYI','pwyR9uAM0iU','wOaKzthMUQ0','XIXd7pUt4cg','mNZ4BqXVfjs','z2oQe6B1Qa4'] },
        { title: 'Market efficiency', videoIds: ['AEv9AszJ4_U','yco0sC7AJ2U','NUkkRdEknjI','3EzdvkRgToY','chSHqogx2CI','bM9bYOBuKF4','NEwRY161m04','a5PF2PcElV0'] },
        { title: 'How to beat the market and mutual fund performance', videoIds: ['pYTraS5WR3s','Iel_GRQNAxA','We17ijX-P6Y','ViTnIebSzj4','fo0Ba9-GCts','wTzciLaCksA','a41LhZE5Iec','PlrLVe3cqfg'] },
        { title: 'Futures, forwards and swaps', videoIds: ['H9UEZdAnnt8','zPyLCUQdh7I','zSiAiF6lvGk','dmVfZ1yjw7E','Pj3R8KFLTjo','DrlKjSG1V6s','1rR4zNQjtjg','i_pLF9J3QPE'] },
        { title: 'Options - Part 1: strategies, binomial pricing and bounds', videoIds: ['nnl3x1wo25g','-GddP-N_klw','QFSyjhqITRA','1p5wJxGNj1Q','-m5jabeJJBs','nN4tOYVqf9o','c4i0mRW1RZI'] },
        { title: 'Options - Part 2: American and exotic options, Black-Scholes', videoIds: ['pkuQLFI13Ws','g3uUgV9xKkE','qZgunj-_1nQ','8Zu6iVmgobo','pr-u4LCFYEY','m2mLrz1PU70','VkUEWUxI6u0','Q2qjnLO3I_M'] },
        { title: 'Full course: MIT 15.401 Finance Theory I (Andrew Lo)', videoIds: ['PLUl4u3cNGP63B2lDhyKOsImI7FjCf6eDW'] },
      ]
    },
    {
      name: 'Marketing Management',
      description: 'Plan and evaluate marketing strategy, from segmentation through to the marketing mix',
      code: 'marketing_management',
      year: 3,
      chapters: [
        { title: 'General introduction', videoIds: ['CQRzEwMMeW4','fFGGqUSdzQM','Ricpkts2lVU','Bb-dX_0Oo_M','-DNWWpIGZeQ','bilOOPuAvTY'] },
        { title: 'An overview of marketing history and theory', videoIds: ['5fdx5Laavkc','X1VRAiWn6R4','pJOTp6t-c8A','hw8FfogTUhU','Fy0KNwzyd74','iq5ucCcRYEE','sR-qL7QdVZQ'] },
        { title: 'The marketing environment', videoIds: ['ehbb8iuYdVs','dhUYXfl4Ozg','bYn4CyL3r5w','mYF2_FBCvXw'] },
        { title: 'Consumer behaviour', videoIds: ['ll36VLhjrbo','AjZrhWVTM3U','8fb71U8OMoc','EfRrD3we0Hg','ig_IdSVa5Ac','Sl-qgzF70IM','iueVZJVEmEs'] },
        { title: 'Organisational buyer behaviour', videoIds: ['YDw1MocJpWE','peiwGrQMsz8','FwhPkdsRp44','Dtlycp9WELA','a4FBGWedrF8'] },
        { title: 'Market segmentation, targeting and positioning', videoIds: ['0srjdRDh99Y','ELZyOPr3rrE','qCtL8szl-Pk','OV2zbaMr-_c','2-m9iJnUJuA','Stc0beAxavY'] },
        { title: 'Customer relationship marketing (CRM)', videoIds: ['yWNzHBYX8Tw','3GWHhz8PeB8','5UrrfG9GG2U','eicCJ6jJxmI','ZP-q0w81E0E','vZgKmH2PCnc','J1h4JQ7bTmA'] },
        { title: 'Branding and product development', videoIds: ['dsU9Gd-kEWM','UN6rpHQGVgc','D2f507ExIco','DA6Lfb543dA','jb3yqwfMDKc','4eIDBV4Mpek','G53MkkQ5dBo'] },
        { title: 'Product innovation and the life-cycle approach', videoIds: ['yQfi_FDssx8','PnVhxn4aFgc','_26E6QR_hmU','9QnfWhtujPA','izP5n1SBEaI','aoeal3ljnqw','qDrMAzCHFUU'] },
        { title: 'Promotion', videoIds: ['wpx66QV0vrM','dQNRWF1BaTc','st0aJ-Vpln8','heE8m-bReDM','4OSr-Fwp7N8','FN4eDk1pq6U','ptlweu4uCmI','4KELuMwZlwM'] },
        { title: 'Pricing', videoIds: ['HEkjAK78b-8','J82_xd5XxXg','hJgUXoV-27c','IJ-Gj0FN5fA','g98eOPnQlkk','t4Qom0cAK1E','SZCV-Gm0Tf4','aR-xxF4-vMU'] },
        { title: 'Distribution', videoIds: ['sz1V_1HP0Sg','1YO7qc5PgM0','5pAUy8sY8cw','bZR0ZrZzJGQ','iSKzd2XDLQc'] },
        { title: 'Corporate social responsibility (CSR)', videoIds: ['ZoKihFLCY0s','2_1TLhe8LY8','vD9XJKZmXEs','lfx4h-ySmes','kTXCtsEhvRM','2NsBcVrPQok','0iIh5YYDR2o'] },
        { title: 'Analytical tools in marketing', videoIds: ['x0L75CV5eSI','lytQxBNDC3Y','dHRoO4kbtug','xJUrBylId7I','rW5SOENyq5g','CMFXsJxi05U','Su2qIrTmv1c'] },
        { title: 'Marketing research', videoIds: ['QnPxaU0yP9k','lyWf43oo87Y','b4us4bNwAsc','S_-bLwHwcoU','nY5vtYCYUfo'] },
        { title: 'Full course: Intro to Marketing lecture series (Kotler and Armstrong based)', videoIds: ['PLM3o01n9O7-AWMI8i97_K2-0z9KXLR5li'] },
      ]
    },
    {
      name: 'Further Mathematics for Economists',
      description: 'Build the advanced mathematical tools used in economic analysis and optimisation',
      code: 'further_maths_economists',
      year: 3,
      chapters: [
        { title: 'Matrices, vectors and systems of linear equations', videoIds: ['csgNflj69-Y','y6bVhgmy2rw','T2Gtt8WygiU','biyQzy2yRUA','P5GJJ02OG08','CcbyMH3Noow','gPnWm-IXoAY','kWorj5BBy9k','RdLo-9jh2EM'] },
        { title: 'Vector spaces, basis, dimension', videoIds: ['EP2ghkO0lSk','tM4TDL9Hj8U','9kDpbZCK62Y','4C9GKyfUQkc'] },
        { title: 'Linear transformations, change of basis', videoIds: ['is1cg5yhdds','vyYrvhbDhW4','HZa1RwFHgwU'] },
        { title: 'Diagonalisation', videoIds: ['TQvxWaQnrqI','WTLl03D4TNA','DUuTx2nbizM'] },
        { title: 'Applications of diagonalisation', videoIds: ['13r9QY6cmjc','IZqwi0wJovM','8e_ux_E0dJ0','UO_dgXa5szg','XXjoh8L1HkE','E-sBhLIjPaM','07V_UNLz0qs','wJxPKj5DpMc'] },
        { title: 'Inner products and orthogonality', videoIds: ['6nqMegdbxik','zHbfZWZJTGc','wHAJzemKQW4'] },
        { title: 'Mathematical analysis', videoIds: ['GJpezCUMOxA','QRGIhqz9vh4','cTnlHZD5ss4','4NURDmE79VU','O98eOlHyWmQ','dcUKdwHRSD8','PJIJ39zThYM','if2Xq4GVuvY'] },
        { title: 'Functions of several variables', videoIds: ['wqtr4Udz8AY','tIpKfDc295M','N_ZRcLheNv0','-HMxX8o6zOc','bohL918kXQk','J08-L2buigM','mRNg-Q9f9W4','s0dZVmPN3Ww'] },
        { title: 'Optimisation of functions of several variables', videoIds: ['_Ffcr98c7EE','Zly5elxZ9w8','yuqB-d5MjZA','m-G3K2GPmEQ','HIm3Z0L90Co','2syXAny8PfE','natJ8yyIvQg','FX7kcDvEsJk'] },
        { title: 'Theory of linear programming, and applications', videoIds: ['D0IlfUDcEvs','VKXsoFoTrx8','0TD9EQcheZM','lSM_TQehx00','bPLNyYFLLT4','sx9cWFLDFmw','q6zKM13aVUI','wG-dm40Zn9s'] },
      ]
    },
  ];

  const subjectsByYear = {
    1: year1Subjects,
    2: year2Subjects,
    3: year3Subjects,
  };
  const subjects = subjectsByYear[selectedYear] || year1Subjects;

  const [showYear2Popup, setShowYear2Popup] = useState(false);

  useEffect(() => {
    setShowYear2Popup(false);
  }, [selectedYear]);

  const dismissYear2Popup = () => {
    try {
      localStorage.setItem(YEAR2_ANNOUNCEMENT_KEY, '1');
    } catch (e) {
      // ignore
    }
    setShowYear2Popup(false);
  };

  return (
    <div className="subject-grid">
      {showYear2Popup && <Year2AnnouncementPopup onClose={dismissYear2Popup} />}
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
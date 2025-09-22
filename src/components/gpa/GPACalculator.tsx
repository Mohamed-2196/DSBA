import React, { useState, useEffect } from 'react';
import './gpa.css';

const GPACalculator = () => {
  const subjects = [
    'Introduction to Economics', 'Mathematical Methods', 'Business and Management in a Global Context', 'Introduction to Mathematical Statistics',
    'Advanced Statistics: Statistical Inference', 'Advanced Statistics: Distribution Theory', 'Business Analytics: Applied Modelling and Prediction', 'Programming for Data Science',
    'Abstract Mathematics/Information Systems/Econometrics', 'Statistical Methods for Market Research', 'Machine Learning', 'Elective1', 'Elective2'
  ];

  const [grades, setGrades] = useState(Array(subjects.length).fill(''));
  const [honorsClass, setHonorsClass] = useState('');
  const [classificationMarksBreakdown, setClassificationMarksBreakdown] = useState({
    firstClass: 0,
    upperSecondClass: 0,
    lowerSecondClass: 0,
    thirdClass: 0,
  });
  const [averageClassificationMark, setAverageClassificationMark] = useState(0);

  const handleGradeChange = (index, value) => {
    const newGrades = [...grades];
    newGrades[index] = value;
    setGrades(newGrades);
  };

  const getGradeDescription = (grade) => {
    if (grade >= 70) return 'First Class';
    if (grade >= 60) return 'Upper Second Class';
    if (grade >= 50) return 'Lower Second Class';
    if (grade >= 40) return 'Third Class';
    return 'Fail';
  };

  useEffect(() => {
    // Calculate classification marks
    const classificationMarks = [];

    // Year 1 subjects (first 4): Each contributes 2 marks
    const yearOneGrades = grades.slice(0, 4).map(Number).filter(g => !isNaN(g));
    if (yearOneGrades.length === 4) {
      const yearOneAverage = yearOneGrades.reduce((sum, grade) => sum + grade, 0) / yearOneGrades.length;
      classificationMarks.push(...Array(2).fill(yearOneAverage)); // Counted as 2 marks
    }

    // Advanced Statistics (subjects 5 and 6): Each contributes 1 mark
    const advancedStatsGrades = grades.slice(4, 6).map(Number).filter(g => !isNaN(g));
    classificationMarks.push(...advancedStatsGrades); // Counted as 1 mark each

    // Remaining subjects (subjects 7 to 13): Each contributes 2 marks
    const remainingGrades = grades.slice(6).map(Number).filter(g => !isNaN(g));
    remainingGrades.forEach(grade => {
      classificationMarks.push(...Array(2).fill(grade)); // Counted as 2 marks each
    });

    // Check for failed subjects
    const hasFailedSubject = classificationMarks.some(g => g < 40);
    if (hasFailedSubject) {
      setHonorsClass('Resit required for failed subjects to pass the degree');
      return;
    }

    // Count classification marks
    const firstClassCount = classificationMarks.filter(g => g >= 70).length;
    const upperSecondClassCount = classificationMarks.filter(g => g >= 60 && g < 70).length;
    const lowerSecondClassCount = classificationMarks.filter(g => g >= 50 && g < 60).length;
    const thirdClassCount = classificationMarks.filter(g => g >= 40 && g < 50).length;

    // Update classification marks breakdown
    setClassificationMarksBreakdown({
      firstClass: firstClassCount,
      upperSecondClass: upperSecondClassCount,
      lowerSecondClass: lowerSecondClassCount,
      thirdClass: thirdClassCount,
    });

    // Calculate average classification mark
    const avgClassificationMark = classificationMarks.length > 0
      ? classificationMarks.reduce((sum, grade) => sum + grade, 0) / classificationMarks.length
      : 0;
    setAverageClassificationMark(avgClassificationMark);

    // Determine honors class
    if (firstClassCount >= 10 || (firstClassCount >= 8 && avgClassificationMark >= 65)) {
      setHonorsClass('First Class Honours');
    } else if (upperSecondClassCount + firstClassCount >= 10 || (upperSecondClassCount + firstClassCount >= 8 && avgClassificationMark >= 56)) {
      setHonorsClass('Upper Second Class Honours');
    } else if (lowerSecondClassCount + upperSecondClassCount + firstClassCount >= 10 || (lowerSecondClassCount + upperSecondClassCount + firstClassCount >= 8 && avgClassificationMark >= 47)) {
      setHonorsClass('Lower Second Class Honours');
    } else if (thirdClassCount + lowerSecondClassCount + upperSecondClassCount + firstClassCount >= 10) {
      setHonorsClass('Third Class Honours');
    } else {
      setHonorsClass('Not Classified');
    }
  }, [grades]);

  return (
    <div className="gpa-calculator">
      <h2>Grade Calculator</h2>
      <div className="calculator-intro">
        <ul>
          <li>Year One: Average of all subjects (counted as 2 marks)</li>
          <li>Advanced Statistics: (each module counted as 1 mark)</li>
          <li>Remaining subjects: Each counted as 2 marks</li>
        </ul>
      </div>
      <table className="grading-system">
        <thead>
          <tr>
            <th>Honours Class</th>
            <th>Criteria</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>First Class Honours</td>
            <td>Ten first-class marks OR Eight first-class marks and an average classification mark of at least 65</td>
          </tr>
          <tr>
            <td>Upper Second Class Honours</td>
            <td>Ten upper second-class marks OR Eight upper second-class marks and an average classification mark of at least 56</td>
          </tr>
          <tr>
            <td>Lower Second Class Honours</td>
            <td>Ten lower second-class marks OR Eight lower second-class marks and an average classification mark of at least 47</td>
          </tr>
          <tr>
            <td>Third Class Honours</td>
            <td>Passed at least 330 credits and attempted 360 credits</td>
          </tr>
        </tbody>
      </table>
      <table className="grade-range-table">
        <thead>
          <tr>
            <th>Grade Range</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>70-100%</td>
            <td>First Class</td>
          </tr>
          <tr>
            <td>60-69%</td>
            <td>Upper Second Class</td>
          </tr>
          <tr>
            <td>50-59%</td>
            <td>Lower Second Class</td>
          </tr>
          <tr>
            <td>40-49%</td>
            <td>Third Class</td>
          </tr>
          <tr>
            <td>0-39%</td>
            <td>Fail</td>
          </tr>
        </tbody>
      </table>
      <table className="subject-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Grade</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject, index) => (
            <React.Fragment key={index}>
              <tr className={`subject-row ${index < 4 ? 'core-subject' : index < 6 ? 'advanced-subject' : ''}`}>
                <td>{subject}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={grades[index]}
                    onChange={(e) => handleGradeChange(index, e.target.value)}
                    placeholder="Enter grade"
                  />
                </td>
                <td className="grade-description" data-grade={grades[index] !== '' ? getGradeDescription(Number(grades[index])) : ''}>
                  {grades[index] !== '' ? getGradeDescription(Number(grades[index])) : ''}
                </td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      {/* Show getting started message when no grades are entered */}
      {grades.every(grade => !grade || isNaN(Number(grade)) || Number(grade) === 0) && (
        <div className="getting-started-section">
          <div className="getting-started-content">
            <h3>📊 Grade Calculator</h3>
          
            <p className="tip">💡 <strong>Remember:</strong> Year 1 subjects are averaged together (count as 2 marks), Advanced Statistics subjects count as 1 mark each, and all other subjects count as 2 marks each.</p>
          </div>
        </div>
      )}

        <div className="grade-breakdown-section">
          <h3>Current Grades Breakdown:</h3>
          <div className="current-grades-grid">
            {/* Year 1 Subjects (grouped together) */}
            {(() => {
              const yearOneGrades = grades.slice(0, 4).map(Number).filter(g => !isNaN(g) && g > 0);
              if (yearOneGrades.length === 4) {
                const yearOneAverage = yearOneGrades.reduce((sum, grade) => sum + grade, 0) / yearOneGrades.length;
                const gradeClass = yearOneAverage >= 70 ? 'first-class' :
                                 yearOneAverage >= 60 ? 'upper-second-class' :
                                 yearOneAverage >= 50 ? 'lower-second-class' : 'third-class';
                return (
                  <div className={`grade-item ${gradeClass}`}>
                    <div className="grade-label">Year 1 Average</div>
                    <div className="grade-value">{yearOneAverage.toFixed(1)}%</div>
                    <div className="grade-description">{getGradeDescription(yearOneAverage)}</div>
                    <div className="grade-weight">Counts as 2 marks</div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Advanced Statistics subjects (index 4, 5) */}
            {grades.slice(4, 6).map((grade, index) => {
              const gradeValue = Number(grade);
              if (!isNaN(gradeValue) && gradeValue > 0) {
                const actualIndex = index + 4;
                const gradeClass = gradeValue >= 70 ? 'first-class' :
                                 gradeValue >= 60 ? 'upper-second-class' :
                                 gradeValue >= 50 ? 'lower-second-class' : 'third-class';
                return (
                  <div key={actualIndex} className={`grade-item ${gradeClass}`}>
                    <div className="grade-label">{subjects[actualIndex]}</div>
                    <div className="grade-value">{gradeValue}%</div>
                    <div className="grade-description">{getGradeDescription(gradeValue)}</div>
                    <div className="grade-weight">Counts as 1 mark</div>
                  </div>
                );
              }
              return null;
            })}

            {/* Remaining subjects (index 6+) */}
            {grades.slice(6).map((grade, index) => {
              const gradeValue = Number(grade);
              if (!isNaN(gradeValue) && gradeValue > 0) {
                const actualIndex = index + 6;
                const gradeClass = gradeValue >= 70 ? 'first-class' :
                                 gradeValue >= 60 ? 'upper-second-class' :
                                 gradeValue >= 50 ? 'lower-second-class' : 'third-class';
                return (
                  <div key={actualIndex} className={`grade-item ${gradeClass}`}>
                    <div className="grade-label">{subjects[actualIndex]}</div>
                    <div className="grade-value">{gradeValue}%</div>
                    <div className="grade-description">{getGradeDescription(gradeValue)}</div>
                    <div className="grade-weight">Counts as 2 marks</div>
                  </div>
                );
              }
              return null;
            })}

            {/* Show message if no grades entered */}
            {grades.every(grade => !grade || isNaN(Number(grade)) || Number(grade) === 0) && (
              <div className="no-grades-message">
                <p>Enter your grades above to see the breakdown here</p>
              </div>
            )}
          </div>
        </div>
      </table>
      {/* Only show classification results if ALL subjects have grades entered */}
      {grades.every(grade => grade && !isNaN(Number(grade)) && Number(grade) > 0) && (
        <div className="results-section">
          <div className="classification-result">
            <h2>Current Classification: {honorsClass}</h2>
            <h3>Average Mark: {averageClassificationMark.toFixed(2)}%</h3>
          </div>

          <div className="breakdown-section">
            <h3>Classification Marks Breakdown:</h3>
            <div className="breakdown-grid">
              <div className="breakdown-item first-class">
                <div className="breakdown-label">First Class (70%+)</div>
                <div className="breakdown-count">{classificationMarksBreakdown.firstClass} marks</div>
                <div className="breakdown-progress">
                  <div
                    className="progress-bar first-class-progress"
                    style={{ width: `${(classificationMarksBreakdown.firstClass / 20) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div className="breakdown-item upper-second-class">
                <div className="breakdown-label">Upper Second (60-69%)</div>
                <div className="breakdown-count">{classificationMarksBreakdown.upperSecondClass} marks</div>
                <div className="breakdown-progress">
                  <div
                    className="progress-bar upper-second-progress"
                    style={{ width: `${(classificationMarksBreakdown.upperSecondClass / 20) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div className="breakdown-item lower-second-class">
                <div className="breakdown-label">Lower Second (50-59%)</div>
                <div className="breakdown-count">{classificationMarksBreakdown.lowerSecondClass} marks</div>
                <div className="breakdown-progress">
                  <div
                    className="progress-bar lower-second-progress"
                    style={{ width: `${(classificationMarksBreakdown.lowerSecondClass / 20) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div className="breakdown-item third-class">
                <div className="breakdown-label">Third Class (40-49%)</div>
                <div className="breakdown-count">{classificationMarksBreakdown.thirdClass} marks</div>
                <div className="breakdown-progress">
                  <div
                    className="progress-bar third-class-progress"
                    style={{ width: `${(classificationMarksBreakdown.thirdClass / 20) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <table className="gpa-conversion">
        <thead>
          <tr>
            <th>UK Degree Classification</th>
            <th>Equivalent Percentage Range</th>
            <th>Approximate GPA (US)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>First Class (1st)</td>
            <td>70-100%</td>
            <td>3.7-4.0</td>
          </tr>
          <tr>
            <td>Upper Second Class (2:1)</td>
            <td>60-69%</td>
            <td>3.3-3.6</td>
          </tr>
          <tr>
            <td>Lower Second Class (2:2)</td>
            <td>50-59%</td>
            <td>2.7-3.2</td>
          </tr>
          <tr>
            <td>Third Class</td>
            <td>40-49%</td>
            <td>2.0-2.6</td>
          </tr>
        </tbody>
      </table>

    </div>
  );
};

export default GPACalculator;
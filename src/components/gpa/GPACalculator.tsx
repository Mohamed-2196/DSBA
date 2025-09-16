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
    if (yearOneGrades.length > 0) {
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
      </table>
      <div className="honors-class">
        <h2>Your Classification: {honorsClass}</h2>
        <h4>Average Mark: {averageClassificationMark.toFixed(2)}</h4>
        <h2>Your Classification Marks Breakdown:</h2>
          <h4>First Class Marks: {classificationMarksBreakdown.firstClass} </h4>
          <h4>Upper Second Class Marks: {classificationMarksBreakdown.upperSecondClass} </h4>
          <h4>Lower Second Class Marks: {classificationMarksBreakdown.lowerSecondClass} </h4>
          <h4>Third Class Marks: {classificationMarksBreakdown.thirdClass} </h4>
      </div>
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
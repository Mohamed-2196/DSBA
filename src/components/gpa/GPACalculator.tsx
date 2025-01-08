import React, { useState, useEffect } from 'react';
import './gpa.css';

const GPACalculator = () => {
  const subjects = [
    'Introduction to Economics', 'Mathematical Methods', 'Business and Management in a Global Context', 'Introduction to Mathematical Statistics',
    'Advanced Statistics: Statistical Inference', 'Advanced Statistics: Distribution Theory', 'Business Analytics: Applied Modelling and Prediction', 'Programming for Data Science',
    'Abstract Mathematics/Information Systems/Econometrics', 'Statistical Methods for Market Research', 'Machine Learning', 'Elective1', 'Elective2'
  ];
  const [grades, setGrades] = useState(Array(subjects.length).fill(''));
  const [topThreeAverage, setTopThreeAverage] = useState(null);
  const [twoSubjectsAverage, setTwoSubjectsAverage] = useState(null);
  const [honorsClass, setHonorsClass] = useState('');
const [aggregate,setaggregate]  = useState(0)
const handleGradeChange = (index, value) => {
    const newGrades = [...grades];
    newGrades[index] = value;
    setGrades(newGrades);
  };

  const getGradeDescription = (grade) => {
    if (grade >= 70) return 'Distinction';
    if (grade >= 60) return 'Merit';
    if (grade >= 50) return 'Pass';
    if (grade >= 40) return 'Borderline Pass';
    return 'Fail';
  };

  useEffect(() => {
    const firstFourGrades = grades.slice(0, 4).map(Number).filter(g => !isNaN(g));
    if (firstFourGrades.length >= 3) {
      const sortedGrades = [...firstFourGrades].sort((a, b) => b - a);
      const topThree = sortedGrades.slice(0, 3);
      const average = topThree.reduce((sum, grade) => sum + grade, 0) / 3;
      setTopThreeAverage(average);
    } else {
      setTopThreeAverage(null);
    }

    const twoSubjectsGrades = grades.slice(4, 6).map(Number).filter(g => !isNaN(g));
    if (twoSubjectsGrades.length === 2) {
      const average = (twoSubjectsGrades[0] + twoSubjectsGrades[1]) / 2;
      setTwoSubjectsAverage(average);
    } else {
      setTwoSubjectsAverage(null);
    }

    // Calculate honors class
    const gradesForHonors = [
      topThreeAverage,
      twoSubjectsAverage,
      ...grades.slice(6).map(Number).filter(g => !isNaN(g))
    ].filter(g => g !== null);

    const hasFailedSubject = gradesForHonors.some(g => g < 40);

    if (hasFailedSubject) {
      setHonorsClass('Resit required for failed subjects to pass the degree');
    } else {
      const distinctionCount = gradesForHonors.filter(g => g >= 70).length;
      const meritCount = gradesForHonors.filter(g => g >= 60 && g < 70).length;
      const passCount = gradesForHonors.filter(g => g >= 50 && g < 60).length;
      const borderlinePassCount = gradesForHonors.filter(g => g >= 40 && g < 50).length;
      setaggregate(gradesForHonors.reduce((sum, grade) => sum + grade, 0));

      if (distinctionCount >= 5 || (distinctionCount >= 4 && aggregate >= 590)) {
        setHonorsClass('First Class Honours');
      } else if (meritCount + distinctionCount>= 5 || (meritCount + distinctionCount>= 4 && aggregate >= 515)) {
        setHonorsClass('Upper Second Class Honours');
      } else if (passCount + meritCount + distinctionCount>= 5 || (passCount + meritCount + distinctionCount>= 4 && aggregate >= 440)) {
        setHonorsClass('Lower Second Class Honours');
      } else if (borderlinePassCount+passCount + meritCount + distinctionCount >= 5) {
        setHonorsClass('Third Class Honours');
      } else {
        setHonorsClass('Not Classified');
      }
    }
  }, [grades]);

  return (
    <div className="gpa-calculator">
 <h2>Grade Calculator</h2>
  <div className="calculator-intro">
    <p>Your degree comprises 13 subjects, but your final classification is based on 9 key assessments:</p>
    <ul>
      <li>Year One: Top 3 grades from 4 subjects (counted as one)</li>
      <li>Advanced Statistics: 2 subjects (counted as one)</li>
      <li>7 individual subjects</li>
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
            <td>Five distinctions OR Four distinctions and an aggregate of 590</td>
          </tr>
          <tr>
            <td>Upper Second Class Honours</td>
            <td>Five merit class marks OR Four merit second class marks and an aggregate of 515</td>
          </tr>
          <tr>
            <td>Lower Second Class Honours</td>
            <td>Five pass marks OR Four pass marks and an aggregate of 440</td>
          </tr>
          <tr>
            <td>Third Class Honours</td>
            <td>Five Borderline Pass marks</td>
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
            <td>Distinction</td>
          </tr>
          <tr>
            <td>60-69%</td>
            <td>Merit</td>
          </tr>
          <tr>
            <td>50-59%</td>
            <td>Pass</td>
          </tr>
          <tr>
            <td>40-49%</td>
            <td>Borderline Pass</td>
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
              {index === 3 && (
                <tr className="average-row core-average">
                  <td colSpan="3">
                    Your Highest 3 Average (Year 1 only): {topThreeAverage !== null ? `${topThreeAverage.toFixed(2)} - ${getGradeDescription(topThreeAverage)}` : 'N/A'}
                    <span className="counted-as-one"> (Counted as one)</span>
                  </td>
                </tr>
              )}
              {index === 5 && (
                <tr className="average-row advanced-average">
                  <td colSpan="3">
                    Average (Advanced Statistics): {twoSubjectsAverage !== null ? `${twoSubjectsAverage.toFixed(2)} - ${getGradeDescription(twoSubjectsAverage)}` : 'N/A'}
                    <span className="counted-as-one"> (Counted as one)</span>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <div className="honors-class">
  <h4>Honours Classification: {honorsClass}</h4>
  <h4>Aggregate: {aggregate}</h4>
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

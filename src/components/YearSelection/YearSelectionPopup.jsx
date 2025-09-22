import { useState, useEffect } from 'react';
import './YearSelectionPopup.css';

const YearSelectionPopup = ({ onYearSelect, onClose }) => {
  const [selectedYear, setSelectedYear] = useState(null);

  const handleYearSelect = (year) => {
    setSelectedYear(year);
    localStorage.setItem('selectedYear', year.toString());
    onYearSelect(year);
    onClose();
  };

  return (
    <div className="year-popup-overlay">
      <div className="year-popup-content">
        <div className="year-popup-header">
          <h2>Welcome to DSBA!</h2>
          <p>Please select your current year of study:</p>
        </div>

        <div className="year-options">
          <button
            className="year-option-button"
            onClick={() => handleYearSelect(1)}
          >
            <div className="year-number">Year 1</div>
            <div className="year-subjects">
              Introduction to Economics<br/>
              Mathematical Methods<br/>
              Business and Management<br/>
              Introduction to Mathematical Statistics
            </div>
          </button>

          <button
            className="year-option-button"
            onClick={() => handleYearSelect(2)}
          >
            <div className="year-number">Year 2</div>
            <div className="year-subjects">
              Advanced Statistics Distribution Theory<br/>
              Advanced Statistics Inferential Statistics<br/>
              Programming for Data Science<br/>
              Business Analytics<br/>
              Econometrics<br/>
              Information System
            </div>
          </button>
        </div>

        <div className="year-popup-footer">
          <p>💡 You can change your year selection anytime by clicking on the DSBA header or in the calendar.</p>
        </div>
      </div>
    </div>
  );
};

export default YearSelectionPopup;
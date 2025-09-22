import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';
import SubjectCardGrid from './components/subjects/subjects';
import Button from './components/gpa/button'
import YearSelectionPopup from './components/YearSelection/YearSelectionPopup';
import { useState, useEffect } from 'react';
// Import other components as needed

function App() {
  const [showPopup, setShowPopup] = useState(false);
  const [selectedYear, setSelectedYear] = useState(1);
  const [showYearSelection, setShowYearSelection] = useState(false);

  useEffect(() => {
    // Check if user has already selected a year
    const storedYear = localStorage.getItem('selectedYear');
    if (storedYear) {
      setSelectedYear(parseInt(storedYear));
    } else {
      // Show year selection popup for first-time users
      setShowYearSelection(true);
    }
  }, []);

  const handleYearSelect = (year) => {
    setSelectedYear(year);
    setShowYearSelection(false);
  };

  const handleYearChange = (year) => {
    setSelectedYear(year);
    localStorage.setItem('selectedYear', year.toString());
  };

  return (
    <Router>
      <div className="App">
        <Navbar selectedYear={selectedYear} onYearChange={handleYearChange} />
        <SubjectCardGrid selectedYear={selectedYear} />
        <button className="fixed-button" onClick={() => setShowPopup(true)}>
  Grade <span className="emoji">🧮</span>
</button>
      {showPopup && <Button onClose={() => setShowPopup(false)} />}
      {showYearSelection && (
        <YearSelectionPopup
          onYearSelect={handleYearSelect}
          onClose={() => setShowYearSelection(false)}
        />
      )}
    </div>
    </Router>
  );
}

export default App;
import { useState, useEffect, useRef } from 'react';
import CustomCalendar from '../Calander/Calander'; // Import the custom calendar
import './Navbar.css';

const Navbar = ({ selectedYear, onYearChange }) => {
  const [showCalendar, setShowCalendar] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const calendarRef = useRef(null);
  const yearDropdownRef = useRef(null);

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') || 'light';
    setIsDarkMode(storedTheme === 'dark');
    document.documentElement.setAttribute('data-theme', storedTheme);
  }, []);

  const handleThemeToggle = () => {
    const nextTheme = isDarkMode ? 'light' : 'dark';
    setIsDarkMode(!isDarkMode);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  const handleYearSelect = (year) => {
    onYearChange(year);
    setShowYearDropdown(false);
  };

  const handleCalendarToggle = () => {
    setShowCalendar(!showCalendar);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(event.target)) {
        setShowYearDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <a href="https://myclass.bibf.com" className="navbar-left">
          <img src="MyClass_logo.png" alt="MyClass" width={"100px"} />
        </a>
        <div className="navbar-center">
          <div
            ref={yearDropdownRef}
            className="navbar-logo"
            title="Click to change year"
            onClick={() => setShowYearDropdown(!showYearDropdown)}
          >
            DSBA - Year {selectedYear}
            {showYearDropdown && (
              <div className="year-dropdown">
                <div
                  className={`year-option ${selectedYear === 1 ? 'selected' : ''}`}
                  onClick={() => handleYearSelect(1)}
                >
                  Year 1
                </div>
                <div
                  className={`year-option ${selectedYear === 2 ? 'selected' : ''}`}
                  onClick={() => handleYearSelect(2)}
                >
                  Year 2
                </div>
              </div>
            )}
          </div>
          <div ref={calendarRef} className="calendar-container">
            <button
              className="calendar-button"
              title="Toggle Calendar"
              onClick={handleCalendarToggle}
            >
              📅
            </button>
            {showCalendar && (
              <div className="calendar-tooltip">
                <CustomCalendar selectedYear={selectedYear} />
              </div>
            )}
          </div>
        </div>
        <div className="navbar-right-group">
          <button
            className="theme-toggle"
            title="Toggle Dark Mode"
            onClick={handleThemeToggle}
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
          {/* {https://my.london.ac.uk/group/student} */}
          <a href="https://my.london.ac.uk/group/student" className="navbar-right">
            <img src="University_of_London.svg.png" alt="University of London" width={"60px"} />
          </a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
import { useState } from 'react';
import CustomCalendar from '../Calander/Calander'; // Import the custom calendar
import './Navbar.css';

const Navbar = () => {
  const [showCalendar, setShowCalendar] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <a href="https://myclass.bibf.com" className="navbar-left">
          <img src="MyClass_logo.png" alt="MyClass" width={"100px"} />
        </a>
        <div 
          className="navbar-logo" 
          title="Calendar" 
          onMouseEnter={() => setShowCalendar(true)} 
          onMouseLeave={() => setShowCalendar(false)}
        >
          DSBA
          {showCalendar && (
            <div className="calendar-tooltip">
              <CustomCalendar />
            </div>
          )}
        </div>
        {/* {https://my.london.ac.uk/group/student} */}
        <a href="https://my.london.ac.uk/group/student" className="navbar-right">
          <img src="University_of_London.svg.png" alt="University of London" width={"60px"} />
        </a>
      </div>
    </nav>
  );
};

export default Navbar;
import { useState } from 'react';
import './CustomCalendar.css';

const events = [
  { date: '2024-12-04', title: 'First Day of Stats MCQ on VLE', color: 'gold' },
  { date: '2024-12-05', title: 'Business Mock Exam', color: 'red' },
  { date: '2024-12-07', title: 'Statistics Mock Exam', color: 'red' },
  { date: '2024-12-12', title: 'Economics & Arabic Exams', color: 'red' },
  { date: '2024-12-14', title: 'Math Mock Exam', color: 'red' },
  { date: '2024-12-16', title: 'Mid Year Break', color: 'green' },
  { date: '2025-01-05', title: 'Classes Resume', color: 'blue' },
  { date: '2025-02-15', title: 'Last Day of Stats MCQ on VLE', color: 'gold' },
  { date: '2025-02-27', title: 'Econ second mock exam', color: 'gold' },
  { date: '2025-03-06', title: 'Stats second mock exam', color: 'gold' },
  { date: '2025-03-13', title: 'Math second mock exam', color: 'gold' },
  { date: '2025-03-19', title: 'Econ third mock exam', color: 'gold' },
  { date: '2025-03-20', title: 'Business Comprehensive mock exam', color: 'gold' },
  { date: '2025-03-27', title: 'stats third mock exam', color: 'gold' },
  { date: '2025-04-03', title: 'Mathmatical Methods third mock Test', color: 'gold' },
    { date: '2025-04-09', title: 'Econ third mock Test and LSE revision', color: 'green' },
    { date: '2025-04-22', title: 'Business & management LSE revision', color: 'green' },
    { date: '2025-04-21', title: 'Mathematical Statistics LSE revision', color: 'green' },
    { date: '2025-04-24', title: 'Mathmatical Methods LSE revision', color: 'green' },

  { date: '2025-04-30', title: 'Economics Final Test', color: 'red' },
  { date: '2025-05-08', title: 'Mathmatical Methods Final Test', color: 'red' },
  { date: '2025-05-09', title: 'Business Final Test', color: 'red' },
  { date: '2025-05-13', title: 'Statistics Final Test', color: 'red' },
];

const CustomCalendar = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleDayClick = (event) => {
    setSelectedEvent(event);
  };

  const renderDays = () => {
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const days = [];

    for (let i = 0; i < monthStart.getDay(); i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }

    for (let i = 1; i <= monthEnd.getDate(); i++) {
      const date = `${currentMonth.getFullYear()}-${(currentMonth.getMonth() + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
      const event = events.find(event => event.date === date);

      days.push(
        <div
          key={date}
          className={`calendar-day ${event ? event.color : ''}`}
          onClick={() => handleDayClick(event)}
          onMouseOver ={() => handleDayClick(event)}
        >
          {i}
          {event && <div className="event-indicator"></div>}
        </div>
      );
    }

    return days;
  };

  return (
    <div className="custom-calendar">
      <div className="calendar-header">
        <button onClick={handlePrevMonth}>&lt;</button>
        <h3>{currentMonth.toLocaleString('default', { month: 'long' })} {currentMonth.getFullYear()}</h3>
        <button onClick={handleNextMonth}>&gt;</button>
      </div>
      <div className="calendar-grid">
        <div className="calendar-day header">Sun</div>
        <div className="calendar-day header">Mon</div>
        <div className="calendar-day header">Tue</div>
        <div className="calendar-day header">Wed</div>
        <div className="calendar-day header">Thu</div>
        <div className="calendar-day header">Fri</div>
        <div className="calendar-day header">Sat</div>
        {renderDays()}
      </div>
      {selectedEvent && (
        <div className="event-popup">
          <h4>{selectedEvent.title}</h4>
          <p>Date: {selectedEvent.date}</p>
          <button onClick={() => setSelectedEvent(null)}>Close</button>
        </div>
      )}
    </div>
  );
};

export default CustomCalendar;
import React, { useState } from 'react';
import GPACalculator from './GPACalculator';
import './gpa.css'
const Popup = ({ onClose }) => {
  return (
    <div className="popup-overlay">
      <div className="popup-content">
        <button className="close-button" onClick={onClose}>×</button>
        <GPACalculator />
      </div>
    </div>
  );
};

export default Popup;
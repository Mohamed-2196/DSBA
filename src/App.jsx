import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';
import SubjectCardGrid from './components/subjects/subjects';
import Button from './components/gpa/button'
import { useState } from 'react';
// Import other components as needed

function App() {
  const [showPopup, setShowPopup] = useState(false);

  return (
    <Router>
      <div className="App">
        <Navbar />
        <SubjectCardGrid />  
        <button className="fixed-button" onClick={() => setShowPopup(true)}>
  Grade <span className="emoji">🧮</span>
</button>
      {showPopup && <Button onClose={() => setShowPopup(false)} />}
    </div>     
    </Router>
  );
}

export default App;
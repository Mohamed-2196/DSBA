import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';
import SubjectCardGrid from './components/subjects/subjects';
// Import other components as needed

function App() {
  return (
    <Router>
      <div className="App">
        <Navbar />
        <SubjectCardGrid />  
      </div>
    </Router>
  );
}

export default App;
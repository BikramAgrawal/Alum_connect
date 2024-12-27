const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs');
const xlsx = require('xlsx'); // To read Excel files
const Data = require('./models/dataModel'); // Your data model file

const app = express();
const port = 3000;

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/Alum_connect', {  })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB connection error:', err));

// Set up Multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads/'); // Save files to 'uploads' directory
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Use a unique filename
  }
});

const upload = multer({ storage: storage });

// Ensure the 'uploads' directory exists
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Serve static files (like CSS, JS) if needed
app.use(express.static(path.join(__dirname, 'public')));

// Serve the index.html file for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html')); // Ensure the path is correct
});

// Endpoint to handle file upload
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Parse the uploaded Excel file
  const workbook = xlsx.readFile(req.file.path);
  const sheet_name_list = workbook.SheetNames;
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);

  try {
    // Insert the data into MongoDB
    const insertedData = await Data.insertMany(data); // Assuming 'Data' is the Mongoose model for your schema
    console.log('Data inserted:', insertedData);
    res.status(200).json({ message: 'File uploaded and data saved!' });
  } catch (error) {
    console.error('Error inserting data:', error);
    res.status(500).json({ error: 'Failed to save data to database' });
  }

  // Optionally, you can delete the file after processing
  fs.unlinkSync(req.file.path);
});

// Start the server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

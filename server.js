const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const Data = require('./models/dataModel');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());

// MongoDB connection
mongoose
  .connect('mongodb://127.0.0.1:27017/Alum_connect', { useNewUrlParser: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Ensure 'uploads' folder exists
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// File upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const workbook = xlsx.readFile(req.file.path);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  try {
    const uniqueData = [];
    for (const record of data) {
      const existingRecord = await Data.findOne({
        name: record.name.trim(),  // Ensure trimming spaces from name
        batch: record.batch
      });
      if (!existingRecord) {
        uniqueData.push(record);
      }
    }

    if (uniqueData.length > 0) {
      await Data.insertMany(uniqueData);
      res.status(200).json({ message: 'File uploaded and data saved!' });
    } else {
      res.status(200).json({ message: 'No new data to save (all data already exists)' });
    }
  } catch (error) {
    console.error('Error inserting data:', error);
    res.status(500).json({ error: 'Failed to save data to database' });
  } finally {
    fs.unlinkSync(req.file.path); // Remove the file after processing
  }
});

// Email sender to request update
app.post('/request-update', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    // Trim input name and ensure case-insensitive search
    const record = await Data.findOne({
      name: new RegExp(`^${name.trim()}$`, 'i')  // Trim spaces and match case-insensitively
    });

    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: record.email,
      subject: 'Request for Update',
      text: `Dear ${record.name},\n\nWe kindly request you to update your details for AlumConnect.\n\nThank you,\nAlumConnect Team`
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Generate PDF report
app.get('/download-report', async (req, res) => {
  try {
    const records = await Data.find().sort({ status: 1 });

    if (records.length === 0) {
      return res.status(404).json({ error: 'No data found to generate report' });
    }

    const doc = new PDFDocument({ margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=alumni_report.pdf');
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('AlumConnect Report', { align: 'center' }).moveDown();

    const groupedData = records.reduce((acc, record) => {
      acc[record.status] = acc[record.status] || [];
      acc[record.status].push(record);
      return acc;
    }, {});

    Object.entries(groupedData).forEach(([status, group]) => {
      doc.fontSize(14).font('Helvetica-Bold').text(`Status: ${status}`).moveDown(0.5);
      group.forEach((record, index) => {
        doc.fontSize(10).text(`${index + 1}. ${record.name} - ${record.email} - ${record.batch} - ${record.company}`);
      });
      doc.moveDown(1);
    });

    doc.end();
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

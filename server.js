const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit'); // For generating PDFs
const Data = require('./models/dataModel'); // Your Mongoose data model

const app = express();
const PORT = 3000;

// MongoDB connection
mongoose
  .connect('mongodb://127.0.0.1:27017/Alum_connect', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Set up Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads/'); // Upload folder
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filenames
  },
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

  // Parse Excel file and save data to MongoDB
  const workbook = xlsx.readFile(req.file.path);
  const sheet_name_list = workbook.SheetNames;
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);

  try {
    // Process each record to check if it already exists
    const uniqueData = [];

    for (const record of data) {
      const existingRecord = await Data.findOne({ name: record.name, batch: record.batch });
      if (!existingRecord) {
        uniqueData.push(record); // Only add records that don't already exist
      }
    }

    if (uniqueData.length > 0) {
      const insertedData = await Data.insertMany(uniqueData);
      console.log('Data inserted:', insertedData);
      res.status(200).json({ message: 'File uploaded and data saved!' });
    } else {
      res.status(200).json({ message: 'No new data to save (all data already exists)' });
    }

  } catch (error) {
    console.error('Error inserting data:', error);
    res.status(500).json({ error: 'Failed to save data to database' });
  }
  
  fs.unlinkSync(req.file.path); // Clean up the file
});

// Generate PDF report endpoint
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

    // Add title
    doc.fontSize(18).font('Helvetica-Bold').text('AlumConnect Report', { align: 'center' });
    doc.moveDown();

    // Group data by status and calculate counts
    const groupedData = records.reduce((acc, record) => {
      acc[record.status] = acc[record.status] || [];
      acc[record.status].push(record);
      return acc;
    }, {});

    // Render all cards (group counts) together
    doc.fontSize(14).font('Helvetica-Bold').text('Group Summary:', { underline: true });
    doc.moveDown(0.5);

    Object.entries(groupedData).forEach(([status, group]) => {
      // Draw a card-like structure for each group's count
      doc
        .rect(50, doc.y, 250, 30) // Draw card outline
        .fillAndStroke('#f0f0f0', '#000') // Background and border colors
        .stroke();
      doc
        .fill('#000') // Reset text color
        .font('Helvetica')
        .text(`Status: ${status} - ${group.length}`, 55, doc.y + 8);
      doc.moveDown(1.5); // Space between cards
    });

    doc.moveDown(1.5); // Add extra space after cards

    // Table header and layout configuration
    const tableHeaders = ['Sl. No', 'Name', 'Batch', 'Status', 'Company/University'];
    const columnWidths = [50, 150, 100, 100, 150];
    const startX = 50;
    const rowHeight = 25;
    let currentY = doc.y;

    // Helper function to draw table headers
    const drawTableHeader = () => {
      let currentX = startX;
      doc.fontSize(12).font('Helvetica-Bold');
      tableHeaders.forEach((header, i) => {
        doc.text(header, currentX + 5, currentY + 5, { width: columnWidths[i] - 10 });
        currentX += columnWidths[i];
        doc.moveTo(currentX, currentY).lineTo(currentX, currentY + rowHeight).stroke();
      });
      doc.moveTo(startX, currentY + rowHeight).lineTo(startX + columnWidths.reduce((a, b) => a + b), currentY + rowHeight).stroke();
      currentY += rowHeight;
    };

    // Helper function to draw a row
    const drawRow = (values) => {
      let currentX = startX;
      doc.fontSize(12).font('Helvetica');
      values.forEach((value, i) => {
        doc.text(String(value), currentX + 5, currentY + 5, { width: columnWidths[i] - 10 });
        currentX += columnWidths[i];
        doc.moveTo(currentX, currentY).lineTo(currentX, currentY + rowHeight).stroke();
      });
      doc.moveTo(startX, currentY + rowHeight).lineTo(startX + columnWidths.reduce((a, b) => a + b), currentY + rowHeight).stroke();
      currentY += rowHeight;
    };

    // Render each group
    Object.entries(groupedData).forEach(([status, group]) => {
      if (currentY + rowHeight * (group.length + 3) > doc.page.height - 50) {
        doc.addPage();
        currentY = 50;
      }

      // Add status header
      doc.fontSize(14).font('Helvetica-Bold').text(`Status: ${status}`, startX, currentY);
      currentY += rowHeight;

      // Draw outer border for the group
      const groupHeight = rowHeight * (group.length + 1);
      doc.rect(startX, currentY, columnWidths.reduce((a, b) => a + b), groupHeight).stroke();

      // Draw table headers
      drawTableHeader();

      // Draw rows
      group.forEach((record, index) => {
        if (currentY + rowHeight > doc.page.height - 50) {
          doc.addPage();
          currentY = 50;
          drawTableHeader();
        }
        drawRow([index + 1, record.name, record.batch, record.status, record.company]);
      });

      currentY += rowHeight; // Space between groups
    });

    doc.end();
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

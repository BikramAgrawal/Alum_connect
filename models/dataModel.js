const mongoose = require('mongoose');

const recordSchema = new mongoose.Schema({
  slNo: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  company: { type: String, required: true },
  dateUpdated: { type: Date, default: Date.now },
  batch: { type: Number, required: true },
  status: { type: String, required: true }
});

const Data = mongoose.model('Data', recordSchema);

module.exports = Data;

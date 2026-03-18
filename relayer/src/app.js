const express = require('express');
const cors = require('cors');
const swapRoutes = require('./routes/swaps');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/swaps', swapRoutes);

module.exports = app;

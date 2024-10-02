import bodyParser from "body-parser";
import express from "express";
import dotenv from "dotenv";
dotenv.config();
import validateEmailRoute from "./routes/validateEmailRoute.js";
import debug from 'debug';
const log = debug('email-validator:server');

const PORT = 3000;
const app = express();

app.use(bodyParser.json());
app.use(validateEmailRoute);

app.listen(PORT, () => {
  console.log(`Server in running on port ${PORT}`);
});

import { validateEmail } from "../controllers/validateEmailController.js";
import { validateMultipleEmails } from "../controllers/validateMultipleEmailsController.js";

import express from 'express'
const router = express.Router();

router.route('/validate-email').post(validateEmail);
router.route('/validate-multiple-emails').post(validateMultipleEmails);

export default router